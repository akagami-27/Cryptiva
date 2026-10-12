(function () {
    'use strict';

    /*
    |--------------------------------------------------------------------------
    | Initialization Guard
    |--------------------------------------------------------------------------
    |
    | Prevent this script from initializing more than once.
    | This protects against duplicate event listeners and duplicate uploads
    | if the script is accidentally included multiple times.
    |
    */

    if (window.__cryptivaFilesInitialized) {
        console.warn('Cryptiva files.js already initialized. Skipping duplicate initialization.');
        return;
    }

    window.__cryptivaFilesInitialized = true;


    /*
    |--------------------------------------------------------------------------
    | State
    |--------------------------------------------------------------------------
    */

    const state = {
        files: [],
        filteredFiles: [],
        selectedFile: null,
        loading: true,
        search: '',
        filter: 'all',
        deleting: false,
        refreshing: false,
        uploading: false
    };


    /*
    |--------------------------------------------------------------------------
    | DOM
    |--------------------------------------------------------------------------
    */

    const elements = {};


    function cacheElements() {
        elements.total =
            document.getElementById('files-total');

        elements.storage =
            document.getElementById('files-storage');

        elements.count =
            document.getElementById('files-count');

        elements.search =
            document.getElementById('files-search');

        elements.filter =
            document.getElementById('files-filter');

        elements.loading =
            document.getElementById('files-loading');

        elements.empty =
            document.getElementById('files-empty');

        elements.emptyTitle =
            document.getElementById('files-empty-title');

        elements.emptyMessage =
            document.getElementById('files-empty-message');

        elements.emptyButton =
            document.getElementById('files-empty-button');

        elements.tableWrap =
            document.getElementById('files-table-wrap');

        elements.tableBody =
            document.getElementById('files-table-body');

        elements.uploadButton =
            document.getElementById('files-upload-button');

        elements.deleteModal =
            document.getElementById('files-delete-modal');

        elements.deleteName =
            document.getElementById('files-delete-name');

        elements.deleteCancel =
            document.getElementById('files-delete-cancel');

        elements.deleteConfirm =
            document.getElementById('files-delete-confirm');

        elements.toast =
            document.getElementById('files-toast');
    }


    /*
    |--------------------------------------------------------------------------
    | CSRF
    |--------------------------------------------------------------------------
    */

    function getCsrfToken() {
        const meta =
            document.querySelector(
                'meta[name="csrf-token"]'
            );

        if (
            meta &&
            meta.content
        ) {
            return meta.content.trim();
        }

        const input =
            document.querySelector(
                'input[name="_csrf"]'
            );

        if (
            input &&
            input.value
        ) {
            return input.value.trim();
        }

        return '';
    }


    /*
    |--------------------------------------------------------------------------
    | Load Current Files
    |--------------------------------------------------------------------------
    */

    async function loadFiles(options = {}) {
        const initial =
            Boolean(options.initial);

        if (
            state.refreshing &&
            !initial
        ) {
            return;
        }

        state.refreshing = true;

        if (initial) {
            state.loading = true;
            setLoading(true);
        }

        try {
            const response =
                await fetch(
                    '/files/data',
                    {
                        method: 'GET',
                        credentials: 'same-origin',
                        headers: {
                            Accept:
                                'application/json'
                        },
                        cache: 'no-store'
                    }
                );

            if (
                response.status === 401 ||
                response.status === 403
            ) {
                window.location.href =
                    '/login';

                return;
            }

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Unable to load your files.'
                );
            }

            const incomingFiles =
                Array.isArray(data.files)
                    ? data.files
                    : [];

            const changed =
                hasFileDataChanged(
                    state.files,
                    incomingFiles
                );

            state.files =
                incomingFiles;

            updateStats(data);

            if (
                changed ||
                initial
            ) {
                state.loading = false;
                applyFilters();
            }

        } catch (error) {
            console.error(
                'Cryptiva files refresh error:',
                error
            );

            if (initial) {
                showToast(
                    'Unable to load your files.',
                    'error'
                );
            }

        } finally {
            state.refreshing = false;
            state.loading = false;

            if (initial) {
                setLoading(false);
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | Detect Changes
    |--------------------------------------------------------------------------
    */

    function hasFileDataChanged(
        oldFiles,
        newFiles
    ) {
        if (
            oldFiles.length !==
            newFiles.length
        ) {
            return true;
        }

        for (
            let index = 0;
            index < newFiles.length;
            index++
        ) {
            const oldFile =
                oldFiles[index];

            const newFile =
                newFiles[index];

            if (
                String(oldFile.id) !==
                String(newFile.id)
            ) {
                return true;
            }

            if (
                oldFile.originalName !==
                newFile.originalName
            ) {
                return true;
            }

            if (
                Number(oldFile.size || 0) !==
                Number(newFile.size || 0)
            ) {
                return true;
            }

            if (
                String(oldFile.uploadedAt || '') !==
                String(newFile.uploadedAt || '')
            ) {
                return true;
            }

            if (
                Boolean(oldFile.hasActiveShare) !==
                Boolean(newFile.hasActiveShare)
            ) {
                return true;
            }

            if (
                Number(oldFile.downloadCount || 0) !==
                Number(newFile.downloadCount || 0)
            ) {
                return true;
            }
        }

        return false;
    }


    /*
    |--------------------------------------------------------------------------
    | Upload
    |--------------------------------------------------------------------------
    */

    function openUploadPicker() {
        /*
        |--------------------------------------------------------------------------
        | Prevent opening another picker while uploading
        |--------------------------------------------------------------------------
        */

        if (state.uploading) {
            return;
        }

        const input =
            document.createElement('input');

        input.type = 'file';

        input.multiple = true;

        input.accept =
            '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif,.mp3,.mp4';

        input.addEventListener(
            'change',
            async function () {
                if (
                    !input.files ||
                    !input.files.length
                ) {
                    return;
                }

                /*
                |--------------------------------------------------------------------------
                | Snapshot selected files
                |--------------------------------------------------------------------------
                |
                | FileList is live in some browser implementations.
                | Convert it to an array before uploading.
                |
                */

                const selectedFiles =
                    Array.from(input.files);

                await uploadFiles(
                    selectedFiles
                );
            },
            {
                once: true
            }
        );

        input.click();
    }


    async function uploadFiles(fileList) {
        /*
        |--------------------------------------------------------------------------
        | Hard client-side duplicate protection
        |--------------------------------------------------------------------------
        */

        if (state.uploading) {
            console.warn(
                'Cryptiva upload already in progress. Duplicate upload blocked.'
            );

            return;
        }

        if (
            !fileList ||
            !fileList.length
        ) {
            return;
        }

        state.uploading = true;

        const formData =
            new FormData();

        /*
        |--------------------------------------------------------------------------
        | Add each selected file exactly once
        |--------------------------------------------------------------------------
        */

        for (
            const file of fileList
        ) {
            formData.append(
                'files',
                file
            );
        }

        const button =
            elements.uploadButton;

        const originalText =
            button
                ? button.textContent
                : 'Upload files';

        if (button) {
            button.disabled = true;
            button.textContent =
                'Uploading...';
        }

        try {
            const csrfToken =
                getCsrfToken();

            if (!csrfToken) {
                throw new Error(
                    'Security token unavailable. Refresh the page and try again.'
                );
            }

            const response =
                await fetch(
                    '/files/upload',
                    {
                        method: 'POST',
                        body: formData,
                        credentials:
                            'same-origin',
                        headers: {
                            Accept:
                                'application/json',
                            'X-CSRF-Token':
                                csrfToken
                        }
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Upload failed.'
                );
            }

            showToast(
                'File uploaded successfully.',
                'success'
            );

            /*
            |--------------------------------------------------------------------------
            | Refresh once after successful upload
            |--------------------------------------------------------------------------
            */

            await loadFiles();

        } catch (error) {
            console.error(
                'Cryptiva upload error:',
                error
            );

            showToast(
                error.message ||
                'Upload failed.',
                'error'
            );

        } finally {
            state.uploading = false;

            if (button) {
                button.disabled = false;
                button.textContent =
                    originalText;
            }
        }
    }


    /*
    |--------------------------------------------------------------------------
    | Download
    |--------------------------------------------------------------------------
    */

    function downloadFile(file) {
        if (
            !file ||
            !file.id
        ) {
            return;
        }

        window.location.href =
            `/files/download/${encodeURIComponent(
                file.id
            )}`;
    }


    /*
    |--------------------------------------------------------------------------
    | Delete Modal
    |--------------------------------------------------------------------------
    */

    function openDeleteModal(file) {
        if (!file) {
            return;
        }

        state.selectedFile =
            file;

        elements.deleteName.textContent =
            file.originalName ||
            'Selected file';

        elements.deleteModal.classList.remove(
            'hidden'
        );

        elements.deleteConfirm.focus();
    }


    function closeDeleteModal() {
        if (state.deleting) {
            return;
        }

        state.selectedFile =
            null;

        elements.deleteModal.classList.add(
            'hidden'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Delete
    |--------------------------------------------------------------------------
    */

    async function confirmDelete() {
        const file =
            state.selectedFile;

        if (
            !file ||
            !file.id ||
            state.deleting
        ) {
            return;
        }

        state.deleting = true;

        elements.deleteConfirm.disabled =
            true;

        elements.deleteConfirm.textContent =
            'Deleting...';

        try {
            const csrfToken =
                getCsrfToken();

            if (!csrfToken) {
                throw new Error(
                    'Security token unavailable. Refresh the page and try again.'
                );
            }

            const response =
                await fetch(
                    `/files/${encodeURIComponent(
                        file.id
                    )}`,
                    {
                        method: 'DELETE',
                        credentials:
                            'same-origin',
                        headers: {
                            Accept:
                                'application/json',
                            'X-CSRF-Token':
                                csrfToken
                        }
                    }
                );

            const data =
                await response.json();

            if (!response.ok) {
                throw new Error(
                    data.error ||
                    'Unable to delete file.'
                );
            }

            closeDeleteModal();

            showToast(
                'File permanently deleted.',
                'success'
            );

            await loadFiles();

        } catch (error) {
            console.error(
                'Cryptiva delete error:',
                error
            );

            showToast(
                error.message ||
                'Unable to delete file.',
                'error'
            );

        } finally {
            state.deleting = false;

            elements.deleteConfirm.disabled =
                false;

            elements.deleteConfirm.textContent =
                'Delete permanently';
        }
    }


    /*
    |--------------------------------------------------------------------------
    | Filtering
    |--------------------------------------------------------------------------
    */

    function applyFilters() {
        const query =
            state.search
                .trim()
                .toLowerCase();

        state.filteredFiles =
            state.files.filter(
                function (file) {
                    const name =
                        String(
                            file.originalName ||
                            ''
                        ).toLowerCase();

                    const category =
                        String(
                            file.category ||
                            'other'
                        ).toLowerCase();

                    const matchesSearch =
                        !query ||
                        name.includes(query);

                    const matchesCategory =
                        state.filter === 'all' ||
                        category ===
                        state.filter;

                    return (
                        matchesSearch &&
                        matchesCategory
                    );
                }
            );

        renderFiles();
    }


    /*
    |--------------------------------------------------------------------------
    | Render Files
    |--------------------------------------------------------------------------
    */

    function renderFiles() {
        if (state.loading) {
            return;
        }

        const files =
            state.filteredFiles;

        elements.count.textContent =
            `${files.length} ${
                files.length === 1
                    ? 'file'
                    : 'files'
            }`;

        if (!state.files.length) {
            showEmptyState(
                'No files yet',
                'Upload your first file to start using your secure vault.',
                'Upload your first file'
            );

            return;
        }

        if (!files.length) {
            showEmptyState(
                'No matching files',
                'Try a different search term or change the file filter.',
                'Clear filters'
            );

            return;
        }

        elements.empty.classList.add(
            'hidden'
        );

        elements.tableWrap.classList.remove(
            'hidden'
        );

        elements.tableBody.innerHTML =
            files
                .map(renderFileRow)
                .join('');
    }


    /*
    |--------------------------------------------------------------------------
    | File Row
    |--------------------------------------------------------------------------
    */

    function renderFileRow(file) {
        const id =
            escapeHtml(
                String(
                    file.id || ''
                )
            );

        const name =
            escapeHtml(
                file.originalName ||
                'Unnamed file'
            );

        const size =
            formatSize(
                Number(file.size) || 0
            );

        const date =
            formatDate(
                file.uploadedAt
            );

        const category =
            formatCategory(
                file.category
            );

        const extension =
            String(
                file.extension || ''
            ).toUpperCase();

        const shareStatus =
            file.hasActiveShare
                ? `
                    <span
                        class="files-security-status"
                    >
                        <span
                            class="files-security-status-dot"
                        ></span>
                        Shared
                    </span>
                `
                : `
                    <span
                        class="files-security-status"
                    >
                        <span
                            class="files-security-status-dot"
                        ></span>
                        Encrypted
                    </span>
                `;

        return `
            <div
                class="files-file-row"
                data-file-id="${id}"
            >

                <div class="files-file-main">

                    <div class="files-file-icon">
                        ${getFileIcon(file)}
                    </div>

                    <div class="files-file-copy">

                        <div
                            class="files-file-name"
                            title="${name}"
                        >
                            ${name}
                        </div>

                        <div class="files-file-meta">

                            <span>
                                ${category}
                            </span>

                            <span
                                class="files-file-meta-dot"
                            ></span>

                            <span>
                                ${extension || 'FILE'}
                            </span>

                        </div>

                    </div>

                </div>

                <div class="files-file-size">
                    ${size}
                </div>

                <div class="files-file-date">
                    ${date}
                </div>

                <div>
                    ${shareStatus}
                </div>

                <div class="files-actions">

                    <button
                        type="button"
                        class="files-action-button"
                        title="Download file"
                        aria-label="Download ${name}"
                        data-action="download"
                        data-id="${id}"
                    >
                        ${getDownloadIcon()}
                    </button>

                    <button
                        type="button"
                        class="files-action-button delete"
                        title="Delete file"
                        aria-label="Delete ${name}"
                        data-action="delete"
                        data-id="${id}"
                    >
                        ${getDeleteIcon()}
                    </button>

                </div>

            </div>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | Empty State
    |--------------------------------------------------------------------------
    */

    function showEmptyState(
        title,
        message,
        buttonText
    ) {
        elements.tableWrap.classList.add(
            'hidden'
        );

        elements.empty.classList.remove(
            'hidden'
        );

        elements.emptyTitle.textContent =
            title;

        elements.emptyMessage.textContent =
            message;

        elements.emptyButton.textContent =
            buttonText;
    }


    /*
    |--------------------------------------------------------------------------
    | Statistics
    |--------------------------------------------------------------------------
    */

    function updateStats(data) {
        elements.total.textContent =
            Number(
                data.fileCount || 0
            );

        elements.storage.textContent =
            formatSize(
                Number(
                    data.totalSize || 0
                )
            );
    }


    /*
    |--------------------------------------------------------------------------
    | Loading
    |--------------------------------------------------------------------------
    */

    function setLoading(loading) {
        if (loading) {
            elements.loading.classList.remove(
                'hidden'
            );

            elements.tableWrap.classList.add(
                'hidden'
            );

            elements.empty.classList.add(
                'hidden'
            );

            return;
        }

        elements.loading.classList.add(
            'hidden'
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Events
    |--------------------------------------------------------------------------
    */

    function bindEvents() {
        /*
        |--------------------------------------------------------------------------
        | Upload button
        |--------------------------------------------------------------------------
        */

        elements.uploadButton.addEventListener(
            'click',
            function (event) {
                event.preventDefault();

                if (state.uploading) {
                    return;
                }

                openUploadPicker();
            }
        );


        /*
        |--------------------------------------------------------------------------
        | Empty state button
        |--------------------------------------------------------------------------
        */

        elements.emptyButton.addEventListener(
            'click',
            function () {
                if (
                    state.files.length &&
                    !state.filteredFiles.length
                ) {
                    state.search = '';
                    state.filter = 'all';

                    elements.search.value = '';
                    elements.filter.value = 'all';

                    applyFilters();

                    return;
                }

                openUploadPicker();
            }
        );


        /*
        |--------------------------------------------------------------------------
        | Search
        |--------------------------------------------------------------------------
        */

        elements.search.addEventListener(
            'input',
            function () {
                state.search =
                    elements.search.value;

                applyFilters();
            }
        );


        /*
        |--------------------------------------------------------------------------
        | Filter
        |--------------------------------------------------------------------------
        */

        elements.filter.addEventListener(
            'change',
            function () {
                state.filter =
                    elements.filter.value;

                applyFilters();
            }
        );


        /*
        |--------------------------------------------------------------------------
        | File Actions
        |--------------------------------------------------------------------------
        */

        elements.tableBody.addEventListener(
            'click',
            function (event) {
                const button =
                    event.target.closest(
                        '[data-action]'
                    );

                if (!button) {
                    return;
                }

                const id =
                    button.dataset.id;

                const file =
                    state.files.find(
                        function (item) {
                            return (
                                String(item.id) ===
                                String(id)
                            );
                        }
                    );

                if (!file) {
                    return;
                }

                const action =
                    button.dataset.action;

                if (
                    action === 'download'
                ) {
                    downloadFile(file);
                }

                if (
                    action === 'delete'
                ) {
                    openDeleteModal(file);
                }
            }
        );


        /*
        |--------------------------------------------------------------------------
        | Delete Modal
        |--------------------------------------------------------------------------
        */

        elements.deleteCancel.addEventListener(
            'click',
            closeDeleteModal
        );

        elements.deleteConfirm.addEventListener(
            'click',
            confirmDelete
        );

        elements.deleteModal.addEventListener(
            'click',
            function (event) {
                if (
                    event.target.classList.contains(
                        'files-modal-backdrop'
                    )
                ) {
                    closeDeleteModal();
                }
            }
        );


        /*
        |--------------------------------------------------------------------------
        | Escape
        |--------------------------------------------------------------------------
        */

        document.addEventListener(
            'keydown',
            function (event) {
                if (
                    event.key === 'Escape'
                ) {
                    closeDeleteModal();
                }
            }
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Icons
    |--------------------------------------------------------------------------
    */

    function getFileIcon(file) {
        const category =
            String(
                file.category ||
                'other'
            ).toLowerCase();

        if (category === 'image') {
            return `
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                >
                    <rect
                        x="4"
                        y="4"
                        width="16"
                        height="16"
                        rx="2"
                        stroke="currentColor"
                        stroke-width="1.6"
                    />

                    <circle
                        cx="9"
                        cy="9"
                        r="1.4"
                        fill="currentColor"
                    />

                    <path
                        d="m5.5 17 4.3-4.3 2.7 2.6 2.2-2.2 3.8 3.9"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                    />
                </svg>
            `;
        }

        if (category === 'video') {
            return `
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                >
                    <rect
                        x="3.5"
                        y="5"
                        width="13"
                        height="14"
                        rx="2"
                        stroke="currentColor"
                        stroke-width="1.6"
                    />

                    <path
                        d="m16.5 10 4-2v8l-4-2"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linejoin="round"
                    />
                </svg>
            `;
        }

        if (category === 'audio') {
            return `
                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
                >
                    <path
                        d="M14 6v10.5"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linecap="round"
                    />

                    <path
                        d="M14 7.5 19 6v9"
                        stroke="currentColor"
                        stroke-width="1.6"
                        stroke-linejoin="round"
                    />

                    <ellipse
                        cx="11.5"
                        cy="17.5"
                        rx="2.5"
                        ry="2"
                        stroke="currentColor"
                        stroke-width="1.6"
                    />

                    <ellipse
                        cx="16.5"
                        cy="15"
                        rx="2.5"
                        ry="2"
                        stroke="currentColor"
                        stroke-width="1.6"
                    />
                </svg>
            `;
        }

        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <path
                    d="M6 3.5h8l4 4v13H6v-17Z"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                />

                <path
                    d="M14 3.5v4h4"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linejoin="round"
                />

                <path
                    d="M9 12h6M9 15.5h6"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                />
            </svg>
        `;
    }


    function getDownloadIcon() {
        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <path
                    d="M12 4v10"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />

                <path
                    d="m7.5 10 4.5 4.5 4.5-4.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />

                <path
                    d="M5 20h14"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
            </svg>
        `;
    }


    function getDeleteIcon() {
        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <path
                    d="M5 7h14"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />

                <path
                    d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <path
                    d="m7 7 .8 12.2h8.4L17 7"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />
            </svg>
        `;
    }


    /*
    |--------------------------------------------------------------------------
    | Helpers
    |--------------------------------------------------------------------------
    */

    function formatSize(bytes) {
        if (
            !Number.isFinite(bytes) ||
            bytes <= 0
        ) {
            return '0 B';
        }

        const units = [
            'B',
            'KB',
            'MB',
            'GB'
        ];

        let value = bytes;
        let unit = 0;

        while (
            value >= 1024 &&
            unit < units.length - 1
        ) {
            value /= 1024;
            unit++;
        }

        if (unit === 0) {
            return `${Math.round(
                value
            )} ${units[unit]}`;
        }

        return `${value.toFixed(
            1
        )} ${units[unit]}`;
    }


    function formatDate(value) {
        if (!value) {
            return 'Unknown';
        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return 'Unknown';
        }

        return date.toLocaleDateString(
            undefined,
            {
                day: '2-digit',
                month: 'short',
                year: 'numeric'
            }
        );
    }


    function formatCategory(category) {
        const value =
            String(
                category ||
                'other'
            ).toLowerCase();

        const map = {
            document: 'Document',
            image: 'Image',
            audio: 'Audio',
            video: 'Video',
            other: 'Other'
        };

        return (
            map[value] ||
            'Other'
        );
    }


    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }


    /*
    |--------------------------------------------------------------------------
    | Toast
    |--------------------------------------------------------------------------
    */

    let toastTimer = null;


    function showToast(
        message,
        type = 'success'
    ) {
        if (!elements.toast) {
            return;
        }

        clearTimeout(toastTimer);

        elements.toast.textContent =
            message;

        elements.toast.className =
            `files-toast ${type} show`;

        toastTimer =
            setTimeout(
                function () {
                    elements.toast.classList.remove(
                        'show'
                    );
                },
                3200
            );
    }


    /*
    |--------------------------------------------------------------------------
    | Real-Time Refresh
    |--------------------------------------------------------------------------
    */

    function startRealtimeSync() {
        setInterval(
            function () {
                /*
                |--------------------------------------------------------------------------
                | Do not refresh while uploading/deleting.
                |--------------------------------------------------------------------------
                */

                if (
                    state.deleting ||
                    state.uploading
                ) {
                    return;
                }

                loadFiles();
            },
            3000
        );
    }


    /*
    |--------------------------------------------------------------------------
    | Initialize
    |--------------------------------------------------------------------------
    */

    async function init() {
        cacheElements();

        /*
        |--------------------------------------------------------------------------
        | Verify required elements exist
        |--------------------------------------------------------------------------
        */

        if (
            !elements.uploadButton ||
            !elements.tableBody ||
            !elements.search ||
            !elements.filter
        ) {
            console.error(
                'Cryptiva files.js: required DOM elements are missing.'
            );

            return;
        }

        bindEvents();

        await loadFiles({
            initial: true
        });

        startRealtimeSync();
    }


    /*
    |--------------------------------------------------------------------------
    | Start Once
    |--------------------------------------------------------------------------
    */

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            init,
            {
                once: true
            }
        );
    } else {
        init();
    }

})();