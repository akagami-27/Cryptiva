'use strict';

if (window.__CRYPTIVA_DASHBOARD_INITIALIZED__) {
    console.warn(
        'Cryptiva dashboard.js already initialized. Skipping duplicate initialization.'
    );
} else {
    window.__CRYPTIVA_DASHBOARD_INITIALIZED__ = true;

(() => {

    /*
    |--------------------------------------------------------------------------
    | Cryptiva Files / Dashboard Controller
    |--------------------------------------------------------------------------
    |
    | Handles:
    | - Real-time file loading
    | - File rendering
    | - Statistics
    | - Search
    | - Upload
    | - Download
    | - Delete
    | - Share
    | - Existing share links
    |
    |--------------------------------------------------------------------------
    */


    const state = {
        files: [],
        filteredFiles: [],
        loading: false,
        uploading: false,
        refreshing: false
    };


    let searchTimer = null;
    let refreshTimer = null;


    const dateFormatter =
        new Intl.DateTimeFormat(
            undefined,
            {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }
        );


    /*
    |--------------------------------------------------------------------------
    | DOM Ready
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        'DOMContentLoaded',
        init
    );


    async function init() {

        bindUploadEvents();

        bindSearchEvents();

        bindFileActions();

        bindShareModal();

        await loadFiles(true);

        startRealtimeRefresh();

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


        console.warn(
            'Cryptiva: CSRF token not found.'
        );


        return '';

    }


    /*
    |--------------------------------------------------------------------------
    | Load Files
    |--------------------------------------------------------------------------
    |
    | IMPORTANT:
    | Uses /files/data.
    |
    | The backend returns:
    |
    | {
    |     success: true,
    |     fileCount: 1,
    |     totalSize: 7,
    |     files: [...]
    | }
    |
    |--------------------------------------------------------------------------
    */

    async function loadFiles(
        initial = false
    ) {

        if (
            state.refreshing &&
            !initial
        ) {

            return;

        }


        state.refreshing = true;


        if (initial) {

            state.loading = true;

            showLoadingState();

        }


        try {

            const response =
                await fetch(
                    '/files/data',
                    {
                        method: 'GET',

                        headers: {
                            'Accept':
                                'application/json'
                        },

                        credentials:
                            'same-origin',

                        cache:
                            'no-store'
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
                await parseResponse(
                    response
                );


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Unable to load your files.'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Store Current Files
            |--------------------------------------------------------------------------
            */

            state.files =
                Array.isArray(
                    data.files
                )
                    ? data.files
                    : [];


            /*
            |--------------------------------------------------------------------------
            | Statistics
            |--------------------------------------------------------------------------
            */

            updateStats(data);


            /*
            |--------------------------------------------------------------------------
            | Username
            |--------------------------------------------------------------------------
            */

            updateUsername(
                data.username
            );


            /*
            |--------------------------------------------------------------------------
            | IMPORTANT
            |--------------------------------------------------------------------------
            |
            | Turn loading OFF BEFORE rendering.
            |
            | This prevents the file list from remaining
            | stuck in the loading state.
            |
            |--------------------------------------------------------------------------
            */

            state.loading = false;


            /*
            |--------------------------------------------------------------------------
            | Render
            |--------------------------------------------------------------------------
            */

            renderFiles();


        } catch (error) {

            console.error(
                'Cryptiva file loading error:',
                error
            );


            state.loading = false;


            if (initial) {

                renderError(
                    error.message ||
                    'Unable to load your files.'
                );

            }

        } finally {

            state.refreshing = false;

            state.loading = false;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Real-Time Refresh
    |--------------------------------------------------------------------------
    |
    | Checks MongoDB-backed file metadata every 3 seconds.
    |
    |--------------------------------------------------------------------------
    */

    function startRealtimeRefresh() {

        stopRealtimeRefresh();


        refreshTimer =
            window.setInterval(
                () => {

                    if (
                        document.visibilityState ===
                        'visible'
                    ) {

                        loadFiles(false);

                    }

                },
                3000
            );

    }


    function stopRealtimeRefresh() {

        if (refreshTimer) {

            clearInterval(
                refreshTimer
            );

            refreshTimer = null;

        }

    }


    document.addEventListener(
        'visibilitychange',
        () => {

            if (
                document.visibilityState ===
                'visible'
            ) {

                loadFiles(false);

            }

        }
    );


    /*
    |--------------------------------------------------------------------------
    | Parse Response
    |--------------------------------------------------------------------------
    */

    async function parseResponse(
        response
    ) {

        const contentType =
            response.headers.get(
                'content-type'
            ) || '';


        if (
            contentType.includes(
                'application/json'
            )
        ) {

            return response.json();

        }


        const text =
            await response.text();


        return {
            error:
                text ||
                'Unexpected server response.'
        };

    }


    /*
    |--------------------------------------------------------------------------
    | Statistics
    |--------------------------------------------------------------------------
    */

    function updateStats(
        data
    ) {

        const statFiles =
            document.getElementById(
                'stat-files'
            );


        const statSize =
            document.getElementById(
                'stat-size'
            );


        const statShared =
            document.getElementById(
                'stat-shared'
            );


        if (statFiles) {

            statFiles.textContent =
                Number(
                    data.fileCount ??
                    state.files.length
                );

        }


        if (statSize) {

            statSize.textContent =
                formatSize(
                    Number(
                        data.totalSize || 0
                    )
                );

        }


        if (statShared) {

            statShared.textContent =
                Number(
                    data.sharedCount || 0
                );

        }


        /*
        |--------------------------------------------------------------------------
        | Files count badge
        |--------------------------------------------------------------------------
        */

        const fileCountBadges =
            document.querySelectorAll(
                '[data-file-count]'
            );


        fileCountBadges.forEach(
            badge => {

                badge.textContent =
                    `${state.files.length} ${
                        state.files.length === 1
                            ? 'file'
                            : 'files'
                    }`;

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Username
    |--------------------------------------------------------------------------
    */

    function updateUsername(
        username
    ) {

        const name =
            username ||
            'User';


        const navUsername =
            document.getElementById(
                'nav-username'
            );


        const navAvatar =
            document.getElementById(
                'nav-avatar'
            );


        if (navUsername) {

            navUsername.textContent =
                name;

        }


        if (navAvatar) {

            navAvatar.textContent =
                name
                    .charAt(0)
                    .toUpperCase();

        }


        /*
        |--------------------------------------------------------------------------
        | Sidebar username
        |--------------------------------------------------------------------------
        */

        const sidebarNames =
            document.querySelectorAll(
                '[data-sidebar-username]'
            );


        sidebarNames.forEach(
            element => {

                element.textContent =
                    name;

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Search
    |--------------------------------------------------------------------------
    */

    function bindSearchEvents() {

        const searchBox =
            document.getElementById(
                'search-box'
            );


        if (!searchBox) {

            return;

        }


        searchBox.addEventListener(
            'input',
            () => {

                clearTimeout(
                    searchTimer
                );


                searchTimer =
                    setTimeout(
                        () => {

                            renderFiles();

                        },
                        100
                    );

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Render Files
    |--------------------------------------------------------------------------
    */

    function renderFiles() {

        const list =
            document.getElementById(
                'file-list'
            );


        if (!list) {

            console.error(
                'Cryptiva: #file-list was not found.'
            );

            return;

        }


        const searchBox =
            document.getElementById(
                'search-box'
            );


        const query =
            searchBox
                ? searchBox.value
                    .trim()
                    .toLowerCase()
                : '';


        state.filteredFiles =
            state.files.filter(
                file => {

                    if (!query) {

                        return true;

                    }


                    const filename =
                        String(
                            file.originalName ||
                            ''
                        ).toLowerCase();


                    return filename.includes(
                        query
                    );

                }
            );


        /*
        |--------------------------------------------------------------------------
        | No Results
        |--------------------------------------------------------------------------
        */

        if (
            state.filteredFiles.length === 0
        ) {

            if (query) {

                renderEmpty(
                    'No matching files',
                    'Try another filename or clear the search.'
                );

            } else {

                renderEmpty(
                    'Your vault is empty',
                    'Upload your first file to start using Cryptiva.'
                );

            }


            return;

        }


        /*
        |--------------------------------------------------------------------------
        | Render Actual Files
        |--------------------------------------------------------------------------
        */

        list.innerHTML =
            state.filteredFiles
                .map(
                    file =>
                        createFileCard(
                            file
                        )
                )
                .join('');

    }


    /*
    |--------------------------------------------------------------------------
    | File Card
    |--------------------------------------------------------------------------
    */

    function createFileCard(
        file
    ) {

        const id =
            escapeHtml(
                String(
                    file.id || ''
                )
            );


        const filename =
            escapeHtml(
                file.originalName ||
                'Unnamed file'
            );


        const extension =
            getExtension(
                file.originalName
            );


        const type =
            extension
                ? extension
                    .replace(
                        '.',
                        ''
                    )
                    .toUpperCase()
                : 'FILE';


        const category =
            getCategory(
                file
            );


        const size =
            formatSize(
                file.size || 0
            );


        const date =
            formatDate(
                file.createdAt ||
                file.uploadedAt ||
                file.updatedAt
            );


        const integrityHash =
            String(
                file.integrity?.sha256 ||
                ''
            ).trim();


        const integrityVerified =
            Boolean(
                file.integrity?.verified
            ) &&
            /^[a-fA-F0-9]{64}$/.test(
                integrityHash
            );


        const isShared =
            Boolean(
                file.hasActiveShare ||
                file.shareId ||
                file.shareUrl ||
                file.share?.active ||
                file.share?.shareUrl
            );


        const downloadCount =
            Number(
                file.downloadCount ||
                file.share?.downloadCount ||
                0
            );


        const shareUrl =
            getShareUrl(
                file
            );


        const downloadLabel =
            downloadCount === 1
                ? 'Downloaded 1 time'
                : `Downloaded ${downloadCount} times`;


        return `
            <article
                class="file-row"
                data-file-id="${id}"
            >

                <div
                    class="file-type-icon file-type-${escapeHtml(category)}"
                >
                    ${escapeHtml(
                        type.slice(0, 4)
                    )}
                </div>


                <div class="file-main">

                    <div class="file-title-line">

                        <strong
                            title="${filename}"
                        >
                            ${filename}
                        </strong>

                        ${
                            isShared
                                ? `
                                    <span class="share-badge">
                                        Shared
                                    </span>
                                `
                                : ''
                        }

                    </div>


                    <div class="file-meta">

                        ${escapeHtml(size)}

                        <span aria-hidden="true">
                            ·
                        </span>

                        ${escapeHtml(date)}

                    </div>


                    <div class="file-integrity">

                        <span
                            class="integrity-status ${
                                integrityVerified
                                    ? 'verified'
                                    : 'unverified'
                            }"
                        >
                            <span
                                class="integrity-dot"
                                aria-hidden="true"
                            ></span>

                            ${
                                integrityVerified
                                    ? 'Integrity verified'
                                    : 'Integrity unavailable'
                            }
                        </span>

                        ${
                            integrityHash
                                ? `
                                    <details class="integrity-details">

                                        <summary>
                                            SHA-256
                                        </summary>

                                        <code
                                            class="integrity-hash"
                                            title="SHA-256 hash"
                                        >
                                            ${escapeHtml(
                                                integrityHash
                                            )}
                                        </code>

                                    </details>
                                `
                                : ''
                        }

                    </div>


                    <div class="file-access">

                        ${
                            isShared
                                ? `
                                    <span class="file-status shared">
                                        <span class="status-dot"></span>
                                        Shared
                                    </span>

                                    <span
                                        class="file-download-count"
                                        title="Successful shared-link downloads"
                                    >
                                        · ${escapeHtml(
                                            downloadLabel
                                        )}
                                    </span>
                                `
                                : `
                                    <span class="file-status">
                                        Private
                                    </span>
                                `
                        }

                    </div>


                    ${
                        isShared && shareUrl
                            ? `
                                <div
                                    class="share-link-row"
                                    data-share-row="${id}"
                                >

                                    <span
                                        class="share-link-text"
                                        title="${escapeHtml(
                                            shareUrl
                                        )}"
                                    >
                                        ${escapeHtml(
                                            shareUrl
                                        )}
                                    </span>


                                    <button
                                        type="button"
                                        class="share-copy-btn"
                                        data-action="copy-share"
                                        data-id="${id}"
                                        title="Copy shared link"
                                    >
                                        Copy
                                    </button>

                                </div>
                            `
                            : ''
                    }

                </div>


                <div class="file-actions">

                    <button
                        type="button"
                        class="action-btn"
                        data-action="download"
                        data-id="${id}"
                        title="Download"
                        aria-label="Download ${filename}"
                    >
                        ${downloadIcon()}
                    </button>


                    <button
                        type="button"
                        class="action-btn action-share"
                        data-action="share"
                        data-id="${id}"
                        title="${
                            isShared
                                ? 'Copy existing secure share'
                                : 'Create secure share'
                        }"
                        aria-label="Share ${filename}"
                    >
                        ${shareIcon()}
                    </button>


                    <button
                        type="button"
                        class="action-btn action-delete"
                        data-action="delete"
                        data-id="${id}"
                        title="Delete"
                        aria-label="Delete ${filename}"
                    >
                        ${deleteIcon()}
                    </button>

                </div>

            </article>
        `;

    }


    /*
    |--------------------------------------------------------------------------
    | File Actions
    |--------------------------------------------------------------------------
    */

    function bindFileActions() {

        document.addEventListener(
            'click',
            async event => {

                const button =
                    event.target.closest(
                        '[data-action]'
                    );


                if (!button) {

                    return;

                }


                const action =
                    button.dataset.action;


                const id =
                    button.dataset.id;


                if (!id) {

                    return;

                }


                const file =
                    state.files.find(
                        item =>
                            String(
                                item.id
                            ) ===
                            String(id)
                    );


                if (!file) {

                    showToast(
                        'File not found.',
                        'error'
                    );

                    return;

                }


                if (
                    action ===
                    'download'
                ) {

                    downloadFile(
                        id
                    );

                    return;

                }


                if (
                    action ===
                    'share'
                ) {

                    await shareFile(
                        id,
                        button
                    );

                    return;

                }


                if (
                    action ===
                    'copy-share'
                ) {

                    await copyExistingShare(
                        file,
                        button
                    );

                    return;

                }


                if (
                    action ===
                    'delete'
                ) {

                    await deleteFile(
                        id
                    );

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Download
    |--------------------------------------------------------------------------
    */

    function downloadFile(
        id
    ) {

        window.location.href =
            `/files/download/${encodeURIComponent(id)}`;

    }


    /*
    |--------------------------------------------------------------------------
    | Share URL
    |--------------------------------------------------------------------------
    */

    function getShareUrl(
        file
    ) {

        const rawUrl =
            file?.shareUrl ||
            file?.share?.shareUrl ||
            file?.share?.url ||
            '';


        if (!rawUrl) {

            return '';

        }


        try {

            return new URL(
                rawUrl,
                window.location.origin
            ).href;

        } catch {

            return String(
                rawUrl
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Copy Existing Share
    |--------------------------------------------------------------------------
    */

    async function copyExistingShare(
        file,
        button
    ) {

        const shareUrl =
            getShareUrl(
                file
            );


        if (!shareUrl) {

            showToast(
                'The shared link is not available.',
                'error'
            );

            return;

        }


        if (button) {

            button.disabled =
                true;

        }


        try {

            const copied =
                await copyToClipboard(
                    shareUrl
                );


            if (copied) {

                showToast(
                    'Shared link copied to clipboard.',
                    'success'
                );

            } else {

                window.prompt(
                    'Your shared link:',
                    shareUrl
                );

            }

        } finally {

            if (button) {

                button.disabled =
                    false;

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Delete
    |--------------------------------------------------------------------------
    */

    async function deleteFile(
        id
    ) {

        const file =
            state.files.find(
                item =>
                    String(
                        item.id
                    ) ===
                    String(id)
            );


        const filename =
            file?.originalName ||
            'this file';


        const confirmed =
            window.confirm(
                `Delete "${filename}"?\n\nThis permanently removes the encrypted file and its active share links.`
            );


        if (!confirmed) {

            return;

        }


        const card =
            document.querySelector(
                `[data-file-id="${CSS.escape(
                    String(id)
                )}"]`
            );


        if (card) {

            card.classList.add(
                'is-deleting'
            );

        }


        try {

            const response =
                await fetch(
                    `/files/${encodeURIComponent(id)}`,
                    {
                        method: 'DELETE',

                        headers: {
                            'Accept':
                                'application/json',

                            'X-CSRF-Token':
                                getCsrfToken()
                        },

                        credentials:
                            'same-origin',

                        cache:
                            'no-store'
                    }
                );


            const data =
                await parseResponse(
                    response
                );


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Unable to delete file.'
                );

            }


            showToast(
                'File deleted successfully.',
                'success'
            );


            await loadFiles(
                false
            );


        } catch (error) {

            console.error(
                'Delete error:',
                error
            );


            if (card) {

                card.classList.remove(
                    'is-deleting'
                );

            }


            showToast(
                error.message ||
                'Unable to delete file.',
                'error'
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Share
    |--------------------------------------------------------------------------
    */

    async function shareFile(
        id,
        button = null
    ) {

        const file =
            state.files.find(
                item =>
                    String(
                        item.id
                    ) ===
                    String(id)
            );


        if (!file) {

            showToast(
                'File not found.',
                'error'
            );

            return;

        }


        /*
        |--------------------------------------------------------------------------
        | Existing share
        |--------------------------------------------------------------------------
        */

        const existingShareUrl =
            getShareUrl(
                file
            );


        if (existingShareUrl) {

            await copyExistingShare(
                file,
                button
            );

            return;

        }


        /*
        |--------------------------------------------------------------------------
        | Open the existing share modal
        |--------------------------------------------------------------------------
        */

        openShareModal(
            id,
            file
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Share Modal
    |--------------------------------------------------------------------------
    */

    let selectedShareFileId =
        null;


    function bindShareModal() {

        const modal =
            document.getElementById(
                'share-modal'
            );


        if (!modal) {

            return;

        }


        const close =
            document.getElementById(
                'share-close'
            );


        if (close) {

            close.addEventListener(
                'click',
                closeShareModal
            );

        }


        modal.addEventListener(
            'click',
            event => {

                if (
                    event.target ===
                    modal
                ) {

                    closeShareModal();

                }

            }
        );


        document.addEventListener(
            'keydown',
            event => {

                if (
                    event.key ===
                    'Escape'
                ) {

                    closeShareModal();

                }

            }
        );


        const form =
            document.getElementById(
                'share-form'
            );


        if (form) {

            form.addEventListener(
                'submit',
                handleShareSubmit
            );

        }

    }


    function openShareModal(
        id,
        file
    ) {

        const modal =
            document.getElementById(
                'share-modal'
            );


        if (!modal) {

            createSimpleShare(
                id
            );

            return;

        }


        selectedShareFileId =
            String(id);


        const filename =
            document.getElementById(
                'share-filename'
            );


        if (filename) {

            filename.textContent =
                file.originalName ||
                'Selected file';

        }


        const password =
            document.getElementById(
                'share-password'
            );


        if (password) {

            password.value =
                '';

        }


        modal.classList.remove(
            'hidden'
        );


        document.body.classList.add(
            'modal-open'
        );


        if (password) {

            setTimeout(
                () => {

                    password.focus();

                },
                50
            );

        }

    }


    function closeShareModal() {

        const modal =
            document.getElementById(
                'share-modal'
            );


        if (modal) {

            modal.classList.add(
                'hidden'
            );

        }


        document.body.classList.remove(
            'modal-open'
        );


        selectedShareFileId =
            null;

    }


    /*
    |--------------------------------------------------------------------------
    | Share Submit
    |--------------------------------------------------------------------------
    */

    async function handleShareSubmit(
        event
    ) {

        event.preventDefault();


        if (!selectedShareFileId) {

            showToast(
                'No file selected.',
                'error'
            );

            return;

        }


        const form =
            event.currentTarget;


        const passwordInput =
            document.getElementById(
                'share-password'
            );


        const password =
            passwordInput
                ? passwordInput.value
                : '';


        if (
            password.length < 8 ||
            password.length > 128
        ) {

            showToast(
                'Share password must be between 8 and 128 characters.',
                'error'
            );

            return;

        }


        const submitButton =
            document.getElementById(
                'share-submit'
            );


        if (submitButton) {

            submitButton.disabled =
                true;

        }


        try {

            const expiryInput =
                document.getElementById(
                    'share-expiry'
                );


            const limitInput =
                document.getElementById(
                    'share-limit'
                );


            const body = {

                password,

                expiresInHours:
                    expiryInput
                        ? expiryInput.value
                        : 24,

                maxDownloads:
                    limitInput
                        ? limitInput.value
                        : 1

            };


            const response =
                await fetch(
                    `/files/share/${encodeURIComponent(
                        selectedShareFileId
                    )}`,
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json',

                            'Accept':
                                'application/json',

                            'X-CSRF-Token':
                                getCsrfToken()
                        },

                        credentials:
                            'same-origin',

                        cache:
                            'no-store',

                        body:
                            JSON.stringify(
                                body
                            )
                    }
                );


            const data =
                await parseResponse(
                    response
                );


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Unable to create share link.'
                );

            }


            const rawUrl =
                data.shareUrl ||
                data.share?.shareUrl ||
                data.url ||
                '';


            if (!rawUrl) {

                throw new Error(
                    'The server did not return a share URL.'
                );

            }


            const shareUrl =
                new URL(
                    rawUrl,
                    window.location.origin
                ).href;


            const file =
                state.files.find(
                    item =>
                        String(
                            item.id
                        ) ===
                        String(
                            selectedShareFileId
                        )
                );


            if (file) {

                file.shareUrl =
                    shareUrl;

                file.shareId =
                    data.share?.id ||
                    null;

                file.downloadCount =
                    Number(
                        data.share?.downloadCount ||
                        0
                    );

                file.maxDownloads =
                    data.share?.maxDownloads ??
                    body.maxDownloads;

                file.expiresAt =
                    data.share?.expiresAt ||
                    null;

                file.hasActiveShare =
                    true;

                file.share = {

                    active: true,

                    shareUrl,

                    downloadCount:
                        file.downloadCount

                };

            }


            closeShareModal();


            renderFiles();


            const copied =
                await copyToClipboard(
                    shareUrl
                );


            if (copied) {

                showToast(
                    'Secure share link created and copied.',
                    'success'
                );

            } else {

                window.prompt(
                    'Your secure share link:',
                    shareUrl
                );

                showToast(
                    'Secure share link created.',
                    'success'
                );

            }


            await loadFiles(
                false
            );


        } catch (error) {

            console.error(
                'Share error:',
                error
            );


            showToast(
                error.message ||
                'Unable to create share link.',
                'error'
            );

        } finally {

            if (submitButton) {

                submitButton.disabled =
                    false;

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Fallback Share
    |--------------------------------------------------------------------------
    */

    async function createSimpleShare(
        id
    ) {

        const password =
            window.prompt(
                'Enter a password for this shared file.\n\nThe password must be at least 8 characters.'
            );


        if (
            password === null
        ) {

            return;

        }


        if (
            password.length < 8 ||
            password.length > 128
        ) {

            showToast(
                'Share password must be between 8 and 128 characters.',
                'error'
            );

            return;

        }


        try {

            const response =
                await fetch(
                    `/files/share/${encodeURIComponent(id)}`,
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json',

                            'Accept':
                                'application/json',

                            'X-CSRF-Token':
                                getCsrfToken()
                        },

                        credentials:
                            'same-origin',

                        body:
                            JSON.stringify({
                                password,
                                expiresInHours: 24,
                                maxDownloads: 1
                            })
                    }
                );


            const data =
                await parseResponse(
                    response
                );


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Unable to create share link.'
                );

            }


            const rawUrl =
                data.shareUrl ||
                data.share?.shareUrl;


            if (!rawUrl) {

                throw new Error(
                    'No share URL returned.'
                );

            }


            const shareUrl =
                new URL(
                    rawUrl,
                    window.location.origin
                ).href;


            const copied =
                await copyToClipboard(
                    shareUrl
                );


            if (copied) {

                showToast(
                    'Secure share link created and copied.',
                    'success'
                );

            } else {

                window.prompt(
                    'Your secure share link:',
                    shareUrl
                );

            }


            await loadFiles(
                false
            );


        } catch (error) {

            console.error(
                'Share error:',
                error
            );


            showToast(
                error.message ||
                'Unable to create share link.',
                'error'
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Upload
    |--------------------------------------------------------------------------
    */

    function bindUploadEvents() {

        const input =
            document.getElementById(
                'file-input'
            );


        const zone =
            document.getElementById(
                'drop-zone'
            );


        const uploadButton =
            document.querySelector(
                '.hero-upload'
            );


        if (uploadButton) {

            uploadButton.addEventListener(
                'click',
                () => {

                    if (input) {

                        input.click();

                    }

                }
            );

        }


        if (input) {

            input.addEventListener(
                'change',
                async () => {

                    if (
                        input.files &&
                        input.files.length
                    ) {

                        await uploadFiles(
                            input.files
                        );

                        input.value =
                            '';

                    }

                }
            );

        }


        if (!zone) {

            return;

        }


        zone.addEventListener(
            'dragover',
            event => {

                event.preventDefault();

                zone.classList.add(
                    'drag-over'
                );

            }
        );


        zone.addEventListener(
            'dragleave',
            () => {

                zone.classList.remove(
                    'drag-over'
                );

            }
        );


        zone.addEventListener(
            'drop',
            async event => {

                event.preventDefault();

                zone.classList.remove(
                    'drag-over'
                );


                const files =
                    event.dataTransfer?.files;


                if (
                    files &&
                    files.length
                ) {

                    await uploadFiles(
                        files
                    );

                }

            }
        );


        zone.addEventListener(
            'click',
            event => {

                if (
                    event.target.closest(
                        'button'
                    )
                ) {

                    return;

                }


                if (input) {

                    input.click();

                }

            }
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Upload Files
    |--------------------------------------------------------------------------
    */

    async function uploadFiles(
        fileList
    ) {

        if (
            state.uploading
        ) {

            return;

        }


        const files =
            Array.from(
                fileList || []
            );


        if (
            files.length === 0
        ) {

            return;

        }


        state.uploading =
            true;


        showUploadProgress(
            0,
            'Preparing upload…'
        );


        try {

            const formData =
                new FormData();


            files.forEach(
                file => {

                    formData.append(
                        'files',
                        file
                    );

                }
            );


            const xhr =
                new XMLHttpRequest();


            const result =
                await new Promise(
                    (
                        resolve,
                        reject
                    ) => {

                        xhr.open(
                            'POST',
                            '/files/upload'
                        );


                        xhr.withCredentials =
                            true;


                        xhr.setRequestHeader(
                            'X-CSRF-Token',
                            getCsrfToken()
                        );


                        xhr.setRequestHeader(
                            'Accept',
                            'application/json'
                        );


                        xhr.upload.addEventListener(
                            'progress',
                            event => {

                                if (
                                    event.lengthComputable
                                ) {

                                    const percent =
                                        Math.round(
                                            (
                                                event.loaded /
                                                event.total
                                            ) *
                                            100
                                        );


                                    showUploadProgress(
                                        percent,
                                        `Uploading… ${percent}%`
                                    );

                                }

                            }
                        );


                        xhr.addEventListener(
                            'load',
                            async () => {

                                try {

                                    const contentType =
                                        xhr.getResponseHeader(
                                            'content-type'
                                        ) || '';


                                    let data;


                                    if (
                                        contentType.includes(
                                            'application/json'
                                        )
                                    ) {

                                        data =
                                            JSON.parse(
                                                xhr.responseText ||
                                                '{}'
                                            );

                                    } else {

                                        data = {

                                            error:
                                                xhr.responseText ||
                                                'Upload failed.'

                                        };

                                    }


                                    if (
                                        xhr.status >= 200 &&
                                        xhr.status < 300
                                    ) {

                                        resolve(
                                            data
                                        );

                                    } else {

                                        reject(
                                            new Error(
                                                data.error ||
                                                'Upload failed.'
                                            )
                                        );

                                    }

                                } catch (error) {

                                    reject(
                                        new Error(
                                            'Invalid upload response.'
                                        )
                                    );

                                }

                            }
                        );


                        xhr.addEventListener(
                            'error',
                            () => {

                                reject(
                                    new Error(
                                        'Network error during upload.'
                                    )
                                );

                            }
                        );


                        xhr.addEventListener(
                            'abort',
                            () => {

                                reject(
                                    new Error(
                                        'Upload was cancelled.'
                                    )
                                );

                            }
                        );


                        xhr.send(
                            formData
                        );

                    }
                );


            showUploadProgress(
                100,
                'Upload complete'
            );


            showToast(
                `${result.files?.length || files.length} file${
                    (result.files?.length || files.length) === 1
                        ? ''
                        : 's'
                } uploaded successfully.`,
                'success'
            );


            await loadFiles(
                false
            );


        } catch (error) {

            console.error(
                'Upload error:',
                error
            );


            showToast(
                error.message ||
                'Unable to upload files.',
                'error'
            );

        } finally {

            state.uploading =
                false;


            setTimeout(
                () => {

                    hideUploadProgress();

                },
                900
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Upload UI
    |--------------------------------------------------------------------------
    */

    function showUploadProgress(
        percent,
        label
    ) {

        const wrapper =
            document.getElementById(
                'progress-wrap'
            );


        const fill =
            document.getElementById(
                'progress-fill'
            );


        const progressLabel =
            document.getElementById(
                'progress-label'
            );


        if (wrapper) {

            wrapper.classList.remove(
                'hidden'
            );

        }


        if (fill) {

            fill.style.width =
                `${Math.max(
                    0,
                    Math.min(
                        100,
                        percent
                    )
                )}%`;

        }


        if (progressLabel) {

            progressLabel.textContent =
                label ||
                'Uploading…';

        }

    }


    function hideUploadProgress() {

        const wrapper =
            document.getElementById(
                'progress-wrap'
            );


        if (wrapper) {

            wrapper.classList.add(
                'hidden'
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Loading
    |--------------------------------------------------------------------------
    */

    function showLoadingState() {

        const list =
            document.getElementById(
                'file-list'
            );


        if (!list) {

            return;

        }


        list.innerHTML = `
            <div class="state-panel">

                <div class="empty-mark">

                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M4 7.5A2.5 2.5 0 0 1 6.5 5h4L13 7.5h4.5A2.5 2.5 0 0 1 20 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10Z"
                            stroke="currentColor"
                            stroke-width="1.7"
                        />
                    </svg>

                </div>

                <strong>
                    Loading your vault…
                </strong>

                <span>
                    Retrieving your encrypted file metadata.
                </span>

            </div>
        `;

    }


    /*
    |--------------------------------------------------------------------------
    | Empty
    |--------------------------------------------------------------------------
    */

    function renderEmpty(
        title,
        message
    ) {

        const list =
            document.getElementById(
                'file-list'
            );


        if (!list) {

            return;

        }


        list.innerHTML = `
            <div class="state-panel">

                <div class="empty-mark">

                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        aria-hidden="true"
                    >
                        <path
                            d="M4 7.5A2.5 2.5 0 0 1 6.5 5h4L13 7.5h4.5A2.5 2.5 0 0 1 20 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-10Z"
                            stroke="currentColor"
                            stroke-width="1.7"
                        />

                        <path
                            d="M8 13h8M8 16h5"
                            stroke="currentColor"
                            stroke-width="1.7"
                            stroke-linecap="round"
                        />

                    </svg>

                </div>

                <strong>
                    ${escapeHtml(title)}
                </strong>

                <span>
                    ${escapeHtml(message)}
                </span>

            </div>
        `;

    }


    /*
    |--------------------------------------------------------------------------
    | Error
    |--------------------------------------------------------------------------
    */

    function renderError(
        message
    ) {

        const list =
            document.getElementById(
                'file-list'
            );


        if (!list) {

            return;

        }


        list.innerHTML = `
            <div class="state-panel">

                <div class="empty-mark error-mark">

                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                    >
                        <circle
                            cx="12"
                            cy="12"
                            r="9"
                            stroke="currentColor"
                            stroke-width="1.7"
                        />

                        <path
                            d="M12 8v5"
                            stroke="currentColor"
                            stroke-width="1.7"
                            stroke-linecap="round"
                        />

                        <circle
                            cx="12"
                            cy="16.5"
                            r=".7"
                            fill="currentColor"
                        />

                    </svg>

                </div>

                <strong>
                    Unable to load files
                </strong>

                <span>
                    ${escapeHtml(message)}
                </span>

            </div>
        `;

    }


    /*
    |--------------------------------------------------------------------------
    | Formatting
    |--------------------------------------------------------------------------
    */

    function formatSize(
        bytes
    ) {

        const value =
            Number(bytes);


        if (
            !Number.isFinite(value) ||
            value <= 0
        ) {

            return '0 B';

        }


        const units = [
            'B',
            'KB',
            'MB',
            'GB',
            'TB'
        ];


        const exponent =
            Math.min(
                Math.floor(
                    Math.log(value) /
                    Math.log(1024)
                ),
                units.length - 1
            );


        const amount =
            value /
            Math.pow(
                1024,
                exponent
            );


        if (
            exponent === 0
        ) {

            return `${Math.round(amount)} B`;

        }


        return `${amount.toFixed(
            amount >= 10
                ? 0
                : 1
        )} ${units[exponent]}`;

    }


    function formatDate(
        value
    ) {

        if (!value) {

            return 'Unknown date';

        }


        const date =
            new Date(value);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return 'Unknown date';

        }


        return dateFormatter.format(
            date
        );

    }


    function getExtension(
        filename
    ) {

        const value =
            String(
                filename || ''
            );


        const index =
            value.lastIndexOf(
                '.'
            );


        if (
            index <= 0
        ) {

            return '';

        }


        return value
            .slice(index)
            .toLowerCase();

    }


    function getCategory(
        file
    ) {

        const category =
            String(
                file?.category ||
                ''
            ).toLowerCase();


        if (
            category
        ) {

            return category
                .replace(
                    /[^a-z0-9_-]/g,
                    ''
                );

        }


        const extension =
            getExtension(
                file?.originalName
            );


        if (
            [
                '.jpg',
                '.jpeg',
                '.png',
                '.gif',
                '.webp'
            ].includes(
                extension
            )
        ) {

            return 'image';

        }


        if (
            [
                '.mp3',
                '.wav'
            ].includes(
                extension
            )
        ) {

            return 'audio';

        }


        if (
            [
                '.mp4',
                '.mov',
                '.avi'
            ].includes(
                extension
            )
        ) {

            return 'video';

        }


        if (
            [
                '.pdf',
                '.doc',
                '.docx',
                '.txt',
                '.csv',
                '.xls',
                '.xlsx',
                '.ppt',
                '.pptx'
            ].includes(
                extension
            )
        ) {

            return 'document';

        }


        return 'other';

    }


    /*
    |--------------------------------------------------------------------------
    | Clipboard
    |--------------------------------------------------------------------------
    */

    async function copyToClipboard(
        value
    ) {

        if (
            navigator.clipboard &&
            window.isSecureContext
        ) {

            try {

                await navigator.clipboard.writeText(
                    value
                );

                return true;

            } catch {

                return false;

            }

        }


        try {

            const textarea =
                document.createElement(
                    'textarea'
                );


            textarea.value =
                value;


            textarea.style.position =
                'fixed';

            textarea.style.opacity =
                '0';


            document.body.appendChild(
                textarea
            );


            textarea.focus();

            textarea.select();


            const copied =
                document.execCommand(
                    'copy'
                );


            textarea.remove();


            return copied;

        } catch {

            return false;

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Toast
    |--------------------------------------------------------------------------
    */

    function showToast(
        message,
        type = 'info'
    ) {

        let container =
            document.getElementById(
                'cryptiva-toast-container'
            );


        if (!container) {

            container =
                document.createElement(
                    'div'
                );


            container.id =
                'cryptiva-toast-container';


            container.style.position =
                'fixed';


            container.style.right =
                '24px';


            container.style.bottom =
                '24px';


            container.style.zIndex =
                '99999';


            container.style.display =
                'flex';


            container.style.flexDirection =
                'column';


            container.style.gap =
                '10px';


            container.style.pointerEvents =
                'none';


            document.body.appendChild(
                container
            );

        }


        const toast =
            document.createElement(
                'div'
            );


        toast.textContent =
            message;


        toast.style.pointerEvents =
            'auto';


        toast.style.maxWidth =
            '380px';


        toast.style.padding =
            '13px 16px';


        toast.style.border =
            '1px solid rgba(255,255,255,.10)';


        toast.style.borderRadius =
            '12px';


        toast.style.background =
            type === 'error'
                ? 'rgba(120,25,45,.94)'
                : type === 'success'
                    ? 'rgba(18,90,70,.94)'
                    : 'rgba(25,25,40,.94)';


        toast.style.color =
            '#fff';


        toast.style.fontSize =
            '13px';


        toast.style.fontWeight =
            '600';


        toast.style.boxShadow =
            '0 15px 40px rgba(0,0,0,.35)';


        container.appendChild(
            toast
        );


        setTimeout(
            () => {

                toast.style.opacity =
                    '0';

                toast.style.transform =
                    'translateY(6px)';

                toast.style.transition =
                    'opacity .2s ease, transform .2s ease';


                setTimeout(
                    () => {

                        toast.remove();

                    },
                    220
                );

            },
            3200
        );

    }


    /*
    |--------------------------------------------------------------------------
    | SVG Icons
    |--------------------------------------------------------------------------
    */

    function downloadIcon() {

        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <path
                    d="M12 3v11"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />

                <path
                    d="m7.5 10.5 4.5 4.5 4.5-4.5"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />

                <path
                    d="M5 20h14"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />
            </svg>
        `;

    }


    function shareIcon() {

        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <circle
                    cx="18"
                    cy="5"
                    r="2.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <circle
                    cx="6"
                    cy="12"
                    r="2.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <circle
                    cx="18"
                    cy="19"
                    r="2.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <path
                    d="m8.2 10.8 7.5-4.4"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />

                <path
                    d="m8.2 13.2 7.5 4.4"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
            </svg>
        `;

    }


    function deleteIcon() {

        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden="true"
            >
                <path
                    d="M4 7h16"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />

                <path
                    d="M9 7V4h6v3"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                />

                <path
                    d="M7 7l1 13h8l1-13"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linejoin="round"
                />

                <path
                    d="M10 11v5M14 11v5"
                    stroke="currentColor"
                    stroke-width="1.6"
                    stroke-linecap="round"
                />
            </svg>
        `;

    }


    /*
    |--------------------------------------------------------------------------
    | Escape HTML
    |--------------------------------------------------------------------------
    */

    function escapeHtml(
        value
    ) {

        return String(
            value ?? ''
        )
            .replaceAll(
                '&',
                '&amp;'
            )
            .replaceAll(
                '<',
                '&lt;'
            )
            .replaceAll(
                '>',
                '&gt;'
            )
            .replaceAll(
                '"',
                '&quot;'
            )
            .replaceAll(
                "'",
                '&#039;'
            );

    }

})();

}