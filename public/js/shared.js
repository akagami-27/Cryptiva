(function () {

    'use strict';

    const state = {
        files: [],
        filteredFiles: [],
        selectedShareId: null,
        selectedFilename: '',
        selectedShare: null
    };

    const elements = {};

    /*
    |--------------------------------------------------------------------------
    | INIT
    |--------------------------------------------------------------------------
    */

    function init() {
        cacheElements();
        bindEvents();
        injectEditModal();
        loadSharedFiles();
    }

    /*
    |--------------------------------------------------------------------------
    | DOM
    |--------------------------------------------------------------------------
    */

    function cacheElements() {

        elements.loading =
            document.getElementById('shared-loading');

        elements.empty =
            document.getElementById('shared-empty');

        elements.tableWrap =
            document.getElementById('shared-table-wrap');

        elements.tableBody =
            document.getElementById('shared-table-body');

        elements.search =
            document.getElementById('shared-search');

        elements.total =
            document.getElementById('shared-total');

        elements.downloads =
            document.getElementById('shared-downloads');

        elements.protected =
            document.getElementById('shared-protected');

        elements.count =
            document.getElementById('shared-count');

        elements.modal =
            document.getElementById('shared-revoke-modal');

        elements.modalBackdrop =
            document.getElementById('shared-revoke-backdrop');

        elements.modalCancel =
            document.getElementById('shared-revoke-cancel');

        elements.modalConfirm =
            document.getElementById('shared-revoke-confirm');

        elements.modalMessage =
            document.getElementById('shared-revoke-message');

        elements.toastRegion =
            document.getElementById('shared-toast-region');
    }

    /*
    |--------------------------------------------------------------------------
    | EVENTS
    |--------------------------------------------------------------------------
    */

    function bindEvents() {

        if (elements.search) {
            elements.search.addEventListener(
                'input',
                renderFiles
            );
        }

        if (elements.modalCancel) {
            elements.modalCancel.addEventListener(
                'click',
                closeRevokeModal
            );
        }

        if (elements.modalBackdrop) {
            elements.modalBackdrop.addEventListener(
                'click',
                closeRevokeModal
            );
        }

        if (elements.modalConfirm) {
            elements.modalConfirm.addEventListener(
                'click',
                revokeSelectedShare
            );
        }

        document.addEventListener(
            'keydown',
            event => {

                if (event.key === 'Escape') {
                    closeRevokeModal();
                    closeEditModal();
                }

            }
        );

        if (elements.tableBody) {
            elements.tableBody.addEventListener(
                'click',
                handleTableAction
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | LOAD
    |--------------------------------------------------------------------------
    */

    async function loadSharedFiles() {

        showLoading();

        try {

            const response =
                await fetch(
                    '/shared/data',
                    {
                        method: 'GET',

                        headers: {
                            Accept: 'application/json'
                        },

                        credentials: 'same-origin',
                        cache: 'no-store'
                    }
                );

            if (
                response.status === 401 ||
                response.status === 403
            ) {

                window.location.href = '/login';
                return;
            }

            const data =
                await parseResponse(response);

            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Unable to load shared files.'
                );
            }

            state.files =
                Array.isArray(data.files)
                    ? data.files
                    : [];

            updateStats();
            renderFiles();

        } catch (error) {

            console.error(
                'Shared Files error:',
                error
            );

            renderError(
                error.message ||
                'Unable to load shared files.'
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | STATS
    |--------------------------------------------------------------------------
    */

    function updateStats() {

        const total =
            state.files.length;

        const downloads =
            state.files.reduce(
                (total, file) => {

                    return (
                        total +
                        Number(
                            file.downloadCount || 0
                        )
                    );

                },
                0
            );

        const protectedCount =
            state.files.filter(
                file =>
                    Boolean(
                        file.passwordProtected
                    )
            ).length;

        if (elements.total) {
            elements.total.textContent =
                total;
        }

        if (elements.downloads) {
            elements.downloads.textContent =
                downloads;
        }

        if (elements.protected) {
            elements.protected.textContent =
                protectedCount;
        }

        if (elements.count) {
            elements.count.textContent =
                `${total} ${
                    total === 1
                        ? 'file'
                        : 'files'
                }`;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | RENDER
    |--------------------------------------------------------------------------
    */

    function renderFiles() {

        if (!elements.tableBody) {
            return;
        }

        const query =
            elements.search
                ? elements.search.value
                    .trim()
                    .toLowerCase()
                : '';

        state.filteredFiles =
            state.files.filter(
                file =>
                    !query ||
                    String(
                        file.originalName || ''
                    )
                        .toLowerCase()
                        .includes(query)
            );

        elements.tableBody.innerHTML = '';

        if (
            state.filteredFiles.length === 0
        ) {

            if (state.files.length === 0) {

                showEmpty(
                    'No shared files',
                    'Files you share will appear here so you can manage their access.'
                );

            } else {

                showEmpty(
                    'No matching files',
                    'Try a different search term.'
                );
            }

            return;
        }

        hideAllStates();

        elements.tableWrap.classList.remove(
            'hidden'
        );

        elements.tableBody.innerHTML =
            state.filteredFiles
                .map(createFileRow)
                .join('');
    }

    /*
    |--------------------------------------------------------------------------
    | FILE ROW
    |--------------------------------------------------------------------------
    */

    function createFileRow(file) {

        const id =
            escapeHtml(file.id);

        const filename =
            escapeHtml(
                file.originalName ||
                'Unnamed file'
            );

        const size =
            formatSize(file.size);

        const sharedDate =
            formatDate(file.createdAt);

        const downloads =
            Number(
                file.downloadCount || 0
            );

        const limit =
            file.maxDownloads !== null &&
            file.maxDownloads !== undefined
                ? Number(file.maxDownloads)
                : null;

        const downloadText =
            limit === null
                ? `${downloads} <span>/ unlimited</span>`
                : `${downloads} <span>/ ${limit}</span>`;

        let percentage = 0;

        if (
            limit !== null &&
            limit > 0
        ) {

            percentage =
                Math.min(
                    100,
                    Math.round(
                        (
                            downloads /
                            limit
                        ) *
                        100
                    )
                );
        }

        const expiry =
            formatExpiry(file.expiresAt);

        const security =
            file.passwordProtected
                ? `
                    <span class="shared-security-badge">
                        LOCKED
                    </span>
                `
                : `
                    <span class="shared-security-badge">
                        PROTECTED
                    </span>
                `;

        let shareUrl = 'Link unavailable';

        if (file.shareUrl) {

            try {

                shareUrl =
                    escapeHtml(
                        new URL(
                            file.shareUrl,
                            window.location.origin
                        ).href
                    );

            } catch {

                shareUrl =
                    escapeHtml(
                        String(file.shareUrl)
                    );
            }
        }

        const editButton =
            file.active
                ? `
                    <button
                        type="button"
                        class="shared-action-button"
                        data-action="edit"
                        data-share-id="${id}"
                        title="Edit share settings"
                        aria-label="Edit share settings"
                    >
                        EDIT
                    </button>
                `
                : '';

        return `

            <article
                class="shared-file-row"
                data-share-id="${id}"
            >

                <div class="shared-file-info">

                    <div class="shared-file-icon">

                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                        >

                            <path
                                d="M6 4h8l4 4v12H6z"
                                stroke="currentColor"
                                stroke-width="1.6"
                                stroke-linejoin="round"
                            />

                            <path
                                d="M14 4v5h4"
                                stroke="currentColor"
                                stroke-width="1.6"
                            />

                        </svg>

                    </div>

                    <div class="shared-file-name-wrap">

                        <div
                            class="shared-file-name"
                            title="${filename}"
                        >
                            ${filename}
                        </div>

                        <div class="shared-file-meta">

                            ${size}
                            ·
                            Shared ${sharedDate}

                        </div>

                    </div>

                </div>

                <div>

                    <div class="shared-downloads">

                        ${downloadText}

                    </div>

                    ${
                        limit !== null
                            ? `
                                <div class="shared-progress">

                                    <div
                                        class="shared-progress-bar"
                                        style="width:${percentage}%"
                                    ></div>

                                </div>
                            `
                            : ''
                    }

                </div>

                <div>

                    <div
                        class="shared-expiry ${expiry.className}"
                    >

                        <strong>
                            ${expiry.label}
                        </strong>

                        <span>
                            ${expiry.detail}
                        </span>

                    </div>

                </div>

                <div class="shared-security">

                    ${security}

                </div>

                <div class="shared-actions">

                    <button
                        type="button"
                        class="shared-action-button"
                        data-action="copy"
                        data-share-id="${id}"
                        title="Copy shared link"
                        aria-label="Copy shared link"
                    >
                        COPY
                    </button>

                    ${editButton}

                    <button
                        type="button"
                        class="shared-action-button danger"
                        data-action="revoke"
                        data-share-id="${id}"
                        title="Revoke shared link"
                        aria-label="Revoke shared link"
                    >
                        REVOKE
                    </button>

                </div>

                <div class="shared-link-display">

                    <span class="shared-link-label">
                        SHARE LINK
                    </span>

                    <span
                        class="shared-link-url"
                        title="${shareUrl}"
                    >
                        ${shareUrl}
                    </span>

                </div>

            </article>

        `;
    }

    /*
    |--------------------------------------------------------------------------
    | ACTIONS
    |--------------------------------------------------------------------------
    */

    async function handleTableAction(event) {

        const button =
            event.target.closest(
                '[data-action]'
            );

        if (!button) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const shareId =
            button.dataset.shareId;

        const share =
            state.files.find(
                file =>
                    String(file.id) ===
                    String(shareId)
            );

        if (!share) {

            showToast(
                'Shared file not found.',
                'error'
            );

            return;
        }

        const action =
            button.dataset.action;

        if (action === 'copy') {

            await copyShareLink(share);
            return;
        }

        if (action === 'edit') {

            openEditModal(share);
            return;
        }

        if (action === 'revoke') {

            openRevokeModal(share);
        }
    }

    /*
    |--------------------------------------------------------------------------
    | COPY
    |--------------------------------------------------------------------------
    */

    async function copyShareLink(share) {

        if (!share.shareUrl) {

            showToast(
                'Share link is unavailable.',
                'error'
            );

            return;
        }

        let shareUrl;

        try {

            shareUrl =
                new URL(
                    share.shareUrl,
                    window.location.origin
                ).href;

        } catch {

            shareUrl =
                String(share.shareUrl);
        }

        try {

            await navigator.clipboard.writeText(
                shareUrl
            );

            showToast(
                'Shared link copied.',
                'success'
            );

        } catch {

            window.prompt(
                'Your shared link:',
                shareUrl
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | REVOKE
    |--------------------------------------------------------------------------
    */

    function openRevokeModal(share) {

        state.selectedShareId =
            share.id;

        state.selectedFilename =
            share.originalName ||
            'this file';

        if (elements.modalMessage) {

            elements.modalMessage.textContent =
                `Revoke access to "${state.selectedFilename}"? The shared link will stop working immediately.`;
        }

        if (elements.modal) {

            elements.modal.classList.remove(
                'hidden'
            );
        }
    }

    function closeRevokeModal() {

        state.selectedShareId = null;

        if (elements.modal) {

            elements.modal.classList.add(
                'hidden'
            );
        }
    }

    async function revokeSelectedShare() {

        const shareId =
            state.selectedShareId;

        if (!shareId) {
            return;
        }

        const csrfToken =
            getCsrfToken();

        if (!csrfToken) {

            showToast(
                'Security token unavailable.',
                'error'
            );

            return;
        }

        if (elements.modalConfirm) {
            elements.modalConfirm.disabled = true;
        }

        try {

            const response =
                await fetch(
                    `/shared/${encodeURIComponent(
                        shareId
                    )}`,
                    {
                        method: 'DELETE',

                        headers: {
                            Accept:
                                'application/json',

                            'X-CSRF-Token':
                                csrfToken
                        },

                        credentials:
                            'same-origin',

                        cache: 'no-store'
                    }
                );

            const data =
                await parseResponse(response);

            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Unable to revoke shared link.'
                );
            }

            closeRevokeModal();

            showToast(
                'Shared link revoked successfully.',
                'success'
            );

            await loadSharedFiles();

        } catch (error) {

            showToast(
                error.message ||
                'Unable to revoke shared link.',
                'error'
            );

        } finally {

            if (elements.modalConfirm) {
                elements.modalConfirm.disabled = false;
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | EDIT SHARE MODAL
    |--------------------------------------------------------------------------
    */

    function injectEditModal() {

        if (
            document.getElementById(
                'shared-edit-modal'
            )
        ) {
            return;
        }

        const style =
            document.createElement('style');

        style.id =
            'shared-edit-modal-styles';

        style.textContent = `

            .shared-edit-modal {
                position: fixed;
                inset: 0;
                z-index: 4000;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
            }

            .shared-edit-modal.hidden {
                display: none !important;
            }

            .shared-edit-backdrop {
                position: absolute;
                inset: 0;
                background: rgba(2, 2, 8, 0.78);
                backdrop-filter: blur(8px);
            }

            .shared-edit-card {
                position: relative;
                z-index: 1;
                width: min(660px, 100%);
                max-height: calc(100vh - 40px);
                overflow-y: auto;
                padding: 38px;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 22px;
                background:
                    linear-gradient(
                        145deg,
                        #11101e,
                        #0a0914
                    );
                box-shadow:
                    0 30px 100px rgba(0,0,0,0.62);
            }

            .shared-edit-close {
                position: absolute;
                top: 18px;
                right: 18px;
                width: 48px;
                height: 48px;
                display: grid;
                place-items: center;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 14px;
                background: rgba(255,255,255,0.025);
                color: #77748a;
                cursor: pointer;
                font-size: 25px;
                font-weight: 300;
                transition:
                    color 0.2s ease,
                    background 0.2s ease,
                    border-color 0.2s ease;
            }

            .shared-edit-close:hover {
                color: #f0edf9;
                background: rgba(255,255,255,0.06);
                border-color: rgba(255,255,255,0.14);
            }

            .shared-edit-eyebrow {
                margin-bottom: 12px;
                color: #8178b8;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 1.7px;
                text-transform: uppercase;
            }

            .shared-edit-title {
                margin: 0;
                color: #f3f1fb;
                font-size: 34px;
                line-height: 1.08;
                letter-spacing: -1.4px;
            }

            .shared-edit-description {
                margin: 12px 0 34px;
                color: #77738b;
                font-size: 14px;
                line-height: 1.6;
            }

            .shared-edit-label-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 15px;
                margin-bottom: 10px;
            }

            .shared-edit-label {
                color: #e2dfeb;
                font-size: 13px;
                font-weight: 700;
            }

            .shared-edit-required {
                color: #777385;
                font-size: 10px;
                font-weight: 700;
                letter-spacing: 0.8px;
                text-transform: uppercase;
            }

            .shared-edit-input {
                width: 100%;
                height: 70px;
                box-sizing: border-box;
                padding: 0 20px;
                border: 1px solid rgba(117,84,239,0.65);
                border-radius: 18px;
                outline: none;
                background: #181725;
                color: #f0edf9;
                font: inherit;
                font-size: 14px;
                box-shadow:
                    0 0 0 7px rgba(117,84,239,0.07);
                transition:
                    border-color 0.2s ease,
                    box-shadow 0.2s ease;
            }

            .shared-edit-input::placeholder {
                color: #656176;
            }

            .shared-edit-input:focus {
                border-color: rgba(126,91,255,0.95);
                box-shadow:
                    0 0 0 7px rgba(117,84,239,0.10);
            }

            .shared-edit-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 22px;
                margin-top: 28px;
            }

            .shared-edit-field {
                min-width: 0;
            }

            .shared-edit-select {
                width: 100%;
                height: 68px;
                padding: 0 17px;
                border: 1px solid rgba(255,255,255,0.08);
                border-radius: 17px;
                outline: none;
                background: #171624;
                color: #dedbed;
                font: inherit;
                font-size: 14px;
                font-weight: 600;
                cursor: pointer;
            }

            .shared-edit-select:focus {
                border-color: rgba(126,91,255,0.55);
                box-shadow:
                    0 0 0 4px rgba(117,84,239,0.08);
            }

            .shared-edit-select option {
                background: #171624;
                color: #eeeaff;
            }

            .shared-edit-preview-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 22px;
                margin-top: 14px;
            }

            .shared-edit-preview {
                display: flex;
                align-items: center;
                gap: 9px;
                min-width: 0;
                color: #666278;
                font-size: 11px;
            }

            .shared-edit-preview svg {
                width: 15px;
                height: 15px;
                flex-shrink: 0;
            }

            .shared-edit-preview.expiry svg {
                color: #8174cf;
            }

            .shared-edit-preview.downloads svg {
                color: #45c9a7;
            }

            .shared-edit-note {
                display: flex;
                align-items: center;
                gap: 14px;
                margin-top: 28px;
                padding: 17px;
                border: 1px solid rgba(91,78,200,0.18);
                border-radius: 14px;
                background: rgba(64,53,145,0.055);
                color: #77738b;
                font-size: 11px;
                line-height: 1.55;
            }

            .shared-edit-note svg {
                width: 21px;
                height: 21px;
                flex-shrink: 0;
                color: #927bff;
            }

            .shared-edit-submit {
                width: 100%;
                height: 69px;
                margin-top: 28px;
                border: 0;
                border-radius: 18px;
                background:
                    linear-gradient(
                        110deg,
                        #7350f4,
                        #5c82ff 50%,
                        #00c9e8
                    );
                color: #ffffff;
                font: inherit;
                font-size: 14px;
                font-weight: 800;
                cursor: pointer;
                box-shadow:
                    0 18px 42px rgba(77,88,236,0.24);
                transition:
                    transform 0.2s ease,
                    filter 0.2s ease,
                    box-shadow 0.2s ease;
            }

            .shared-edit-submit:hover {
                transform: translateY(-1px);
                filter: brightness(1.06);
                box-shadow:
                    0 22px 48px rgba(77,88,236,0.30);
            }

            .shared-edit-submit:disabled {
                opacity: 0.55;
                cursor: not-allowed;
                transform: none;
            }

            .shared-edit-error {
                display: none;
                margin-top: 10px;
                color: #ed8585;
                font-size: 11px;
            }

            .shared-edit-error.visible {
                display: block;
            }

            @media (max-width: 650px) {

                .shared-edit-card {
                    padding: 28px 22px;
                    border-radius: 18px;
                }

                .shared-edit-title {
                    font-size: 29px;
                }

                .shared-edit-grid,
                .shared-edit-preview-grid {
                    grid-template-columns: 1fr;
                    gap: 15px;
                }

                .shared-edit-close {
                    width: 42px;
                    height: 42px;
                }

            }

        `;

        document.head.appendChild(style);

        const modal =
            document.createElement('div');

        modal.className =
            'shared-edit-modal hidden';

        modal.id =
            'shared-edit-modal';

        modal.setAttribute(
            'role',
            'dialog'
        );

        modal.setAttribute(
            'aria-modal',
            'true'
        );

        modal.innerHTML = `

            <div
                class="shared-edit-backdrop"
                id="shared-edit-backdrop"
            ></div>

            <div class="shared-edit-card">

                <button
                    type="button"
                    class="shared-edit-close"
                    id="shared-edit-close"
                    aria-label="Close"
                >
                    ×
                </button>

                <div class="shared-edit-eyebrow">
                    CONTROLLED ACCESS
                </div>

                <h2 class="shared-edit-title">
                    Update secure share
                </h2>

                <p class="shared-edit-description">
                    Change the access settings for this shared file.
                </p>

                <form
                    id="shared-edit-form"
                    novalidate
                >

                    <div class="shared-edit-label-row">

                        <label
                            class="shared-edit-label"
                            for="shared-edit-password"
                        >
                            Password
                        </label>

                        <span class="shared-edit-required">
                            REQUIRED
                        </span>

                    </div>

                    <input
                        id="shared-edit-password"
                        class="shared-edit-input"
                        type="password"
                        minlength="8"
                        maxlength="128"
                        autocomplete="new-password"
                        placeholder="Enter a new password (8–128 characters)"
                        required
                    >

                    <div
                        class="shared-edit-error"
                        id="shared-edit-error"
                    ></div>

                    <div class="shared-edit-grid">

                        <div class="shared-edit-field">

                            <div class="shared-edit-label-row">

                                <label
                                    class="shared-edit-label"
                                    for="shared-edit-expiry"
                                >
                                    Expires in
                                </label>

                            </div>

                            <select
                                id="shared-edit-expiry"
                                class="shared-edit-select"
                            >

                                <option value="1">
                                    1 hour
                                </option>

                                <option value="6">
                                    6 hours
                                </option>

                                <option value="24">
                                    1 day
                                </option>

                                <option value="72">
                                    3 days
                                </option>

                                <option value="168">
                                    7 days
                                </option>

                                <option value="336">
                                    14 days
                                </option>

                                <option value="720" selected>
                                    30 days
                                </option>

                            </select>

                        </div>

                        <div class="shared-edit-field">

                            <div class="shared-edit-label-row">

                                <label
                                    class="shared-edit-label"
                                    for="shared-edit-downloads"
                                >
                                    Maximum downloads
                                </label>

                            </div>

                            <select
                                id="shared-edit-downloads"
                                class="shared-edit-select"
                            >

                                <option value="1">
                                    1 download
                                </option>

                                <option value="5">
                                    5 downloads
                                </option>

                                <option value="10">
                                    10 downloads
                                </option>

                                <option value="25" selected>
                                    25 downloads
                                </option>

                                <option value="50">
                                    50 downloads
                                </option>

                                <option value="100">
                                    100 downloads
                                </option>

                                <option value="500">
                                    500 downloads
                                </option>

                                <option value="1000">
                                    1,000 downloads
                                </option>

                                <option value="">
                                    Unlimited
                                </option>

                            </select>

                        </div>

                    </div>

                    <div class="shared-edit-preview-grid">

                        <div
                            class="shared-edit-preview expiry"
                            id="shared-edit-expiry-preview"
                        >

                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.7"
                            >

                                <circle
                                    cx="12"
                                    cy="12"
                                    r="8"
                                ></circle>

                                <path
                                    d="M12 7v5l3 2"
                                ></path>

                            </svg>

                            <span>
                                Expires soon
                            </span>

                        </div>

                        <div
                            class="shared-edit-preview downloads"
                            id="shared-edit-download-preview"
                        >

                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.7"
                            >

                                <rect
                                    x="5"
                                    y="4"
                                    width="14"
                                    height="16"
                                    rx="2"
                                ></rect>

                                <path
                                    d="M8 8h8M8 12h8M8 16h5"
                                ></path>

                            </svg>

                            <span>
                                Link can be downloaded 25 times
                            </span>

                        </div>

                    </div>

                    <div class="shared-edit-note">

                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.7"
                        >

                            <path
                                d="M12 3.5 19 6v5.4c0 4.5-2.8 7.6-7 9.1-4.2-1.5-7-4.6-7-9.1V6l7-2.5Z"
                            ></path>

                            <path
                                d="M12 8v4"
                            ></path>

                            <circle
                                cx="12"
                                cy="16"
                                r=".7"
                                fill="currentColor"
                            ></circle>

                        </svg>

                        <span>
                            The existing secure link will remain unchanged.
                            Only the access settings will be updated.
                        </span>

                    </div>

                    <button
                        type="submit"
                        class="shared-edit-submit"
                        id="shared-edit-submit"
                    >
                        Update secure link
                    </button>

                </form>

            </div>

        `;

        document.body.appendChild(modal);

        elements.editModal =
            document.getElementById(
                'shared-edit-modal'
            );

        elements.editBackdrop =
            document.getElementById(
                'shared-edit-backdrop'
            );

        elements.editClose =
            document.getElementById(
                'shared-edit-close'
            );

        elements.editForm =
            document.getElementById(
                'shared-edit-form'
            );

        elements.editPassword =
            document.getElementById(
                'shared-edit-password'
            );

        elements.editExpiry =
            document.getElementById(
                'shared-edit-expiry'
            );

        elements.editDownloads =
            document.getElementById(
                'shared-edit-downloads'
            );

        elements.editExpiryPreview =
            document.getElementById(
                'shared-edit-expiry-preview'
            );

        elements.editDownloadPreview =
            document.getElementById(
                'shared-edit-download-preview'
            );

        elements.editSubmit =
            document.getElementById(
                'shared-edit-submit'
            );

        elements.editError =
            document.getElementById(
                'shared-edit-error'
            );

        if (elements.editClose) {

            elements.editClose.addEventListener(
                'click',
                closeEditModal
            );
        }

        if (elements.editBackdrop) {

            elements.editBackdrop.addEventListener(
                'click',
                closeEditModal
            );
        }

        if (elements.editForm) {

            elements.editForm.addEventListener(
                'submit',
                submitEditShare
            );
        }

        /*
        |--------------------------------------------------------------------------
        | DIRECT BUTTON HANDLER
        |--------------------------------------------------------------------------
        | This guarantees the update action fires even if another script
        | interferes with the form submit event.
        */

        if (elements.editSubmit) {

            elements.editSubmit.addEventListener(
                'click',
                function (event) {

                    event.preventDefault();
                    event.stopPropagation();

                    submitEditShare(event);
                }
            );
        }

        if (elements.editExpiry) {

            elements.editExpiry.addEventListener(
                'change',
                updateEditPreviews
            );
        }

        if (elements.editDownloads) {

            elements.editDownloads.addEventListener(
                'change',
                updateEditPreviews
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | OPEN EDIT
    |--------------------------------------------------------------------------
    */

    function openEditModal(share) {

        if (
            !share ||
            !share.active
        ) {

            showToast(
                'Only active shares can be edited.',
                'error'
            );

            return;
        }

        state.selectedShare =
            share;

        if (elements.editPassword) {
            elements.editPassword.value = '';
        }

        if (elements.editError) {

            elements.editError.textContent = '';

            elements.editError.classList.remove(
                'visible'
            );
        }

        setExpirySelect(
            share.expiresAt
        );

        setDownloadsSelect(
            share.maxDownloads
        );

        updateEditPreviews();

        if (elements.editModal) {

            elements.editModal.classList.remove(
                'hidden'
            );
        }

        setTimeout(
            () => {

                if (elements.editPassword) {
                    elements.editPassword.focus();
                }

            },
            50
        );
    }

    /*
    |--------------------------------------------------------------------------
    | CLOSE EDIT
    |--------------------------------------------------------------------------
    */

    function closeEditModal() {

        state.selectedShare = null;

        if (elements.editModal) {

            elements.editModal.classList.add(
                'hidden'
            );
        }

        if (elements.editForm) {
            elements.editForm.reset();
        }

        if (elements.editError) {

            elements.editError.textContent = '';

            elements.editError.classList.remove(
                'visible'
            );
        }
    }

    /*
    |--------------------------------------------------------------------------
    | SET EXPIRY SELECT
    |--------------------------------------------------------------------------
    */

    function setExpirySelect(expiresAt) {

        if (!elements.editExpiry) {
            return;
        }

        if (!expiresAt) {

            elements.editExpiry.value =
                '720';

            return;
        }

        const difference =
            new Date(expiresAt).getTime() -
            Date.now();

        const hours =
            Math.max(
                1,
                Math.ceil(
                    difference /
                    (
                        1000 *
                        60 *
                        60
                    )
                )
            );

        const options =
            Array.from(
                elements.editExpiry.options
            );

        let closest =
            options[0];

        let closestDifference =
            Infinity;

        for (
            const option of options
        ) {

            const value =
                Number(option.value);

            if (
                !Number.isFinite(value)
            ) {
                continue;
            }

            const differenceFromCurrent =
                Math.abs(
                    value -
                    hours
                );

            if (
                differenceFromCurrent <
                closestDifference
            ) {

                closestDifference =
                    differenceFromCurrent;

                closest =
                    option;
            }
        }

        if (closest) {

            elements.editExpiry.value =
                closest.value;
        }
    }

    /*
    |--------------------------------------------------------------------------
    | SET DOWNLOAD SELECT
    |--------------------------------------------------------------------------
    */

    function setDownloadsSelect(maxDownloads) {

        if (!elements.editDownloads) {
            return;
        }

        if (
            maxDownloads === null ||
            maxDownloads === undefined
        ) {

            elements.editDownloads.value =
                '';

            return;
        }

        const value =
            String(maxDownloads);

        const optionExists =
            Array.from(
                elements.editDownloads.options
            )
                .some(
                    option =>
                        option.value === value
                );

        if (optionExists) {

            elements.editDownloads.value =
                value;

            return;
        }

        elements.editDownloads.value =
            '1000';
    }

    /*
    |--------------------------------------------------------------------------
    | PREVIEWS
    |--------------------------------------------------------------------------
    */

    function updateEditPreviews() {

        if (
            !elements.editExpiry ||
            !elements.editDownloads
        ) {
            return;
        }

        const expiryHours =
            Number(
                elements.editExpiry.value
            );

        const downloadsValue =
            elements.editDownloads.value;

        const expiryDate =
            new Date(
                Date.now() +
                expiryHours *
                60 *
                60 *
                1000
            );

        if (elements.editExpiryPreview) {

            const span =
                elements.editExpiryPreview
                    .querySelector('span');

            if (span) {

                span.textContent =
                    `Expires ${formatFullDate(
                        expiryDate
                    )}`;
            }
        }

        if (elements.editDownloadPreview) {

            const text =
                downloadsValue === ''
                    ? 'Link can be downloaded without a limit'
                    : `Link can be downloaded ${Number(
                        downloadsValue
                    ).toLocaleString()} times`;

            const span =
                elements.editDownloadPreview
                    .querySelector('span');

            if (span) {
                span.textContent = text;
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | SUBMIT EDIT
    |--------------------------------------------------------------------------
    */

    async function submitEditShare(event) {

        if (event) {
            event.preventDefault();
        }

        const share =
            state.selectedShare;

        if (!share) {

            showToast(
                'Shared file not found.',
                'error'
            );

            return;
        }

        const password =
            String(
                elements.editPassword.value || ''
            );

        if (
            password.length < 8 ||
            password.length > 128
        ) {

            showEditError(
                'Password must be between 8 and 128 characters.'
            );

            elements.editPassword.focus();

            return;
        }

        const expiresInHours =
            Number(
                elements.editExpiry.value
            );

        if (
            !Number.isFinite(expiresInHours) ||
            expiresInHours <= 0 ||
            expiresInHours > 720
        ) {

            showEditError(
                'Invalid expiration period.'
            );

            return;
        }

        const maxDownloads =
            elements.editDownloads.value === ''
                ? null
                : Number(
                    elements.editDownloads.value
                );

        if (
            maxDownloads !== null &&
            (
                !Number.isInteger(maxDownloads) ||
                maxDownloads < 1 ||
                maxDownloads > 100000
            )
        ) {

            showEditError(
                'Invalid download limit.'
            );

            return;
        }

        const csrfToken =
            getCsrfToken();

        if (!csrfToken) {

            showEditError(
                'Security token unavailable.'
            );

            return;
        }

        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        | Backend expects the FILE ID:
        |
        | POST /files/share/:id
        |
        | NOT the ShareLink ID.
        |--------------------------------------------------------------------------
        */

        const fileId =
            String(
                share.fileId ||
                ''
            ).trim();

        if (!fileId) {

            showEditError(
                'File identifier is missing.'
            );

            console.error(
                'Share update aborted: missing fileId',
                share
            );

            return;
        }

        if (elements.editSubmit) {

            elements.editSubmit.disabled =
                true;

            elements.editSubmit.textContent =
                'Updating secure link...';
        }

        clearEditError();

        /*
        |--------------------------------------------------------------------------
        | SEND REQUEST
        |--------------------------------------------------------------------------
        */

        try {

            const endpoint =
                `/files/share/${encodeURIComponent(
                    fileId
                )}`;

            const requestBody = {
                password,
                expiresInHours,
                maxDownloads
            };

            console.log(
                '[Cryptiva] Updating share:',
                {
                    fileId,
                    endpoint,
                    expiresInHours,
                    maxDownloads
                }
            );

            const response =
                await fetch(
                    endpoint,
                    {
                        method: 'POST',

                        headers: {
                            'Content-Type':
                                'application/json',

                            Accept:
                                'application/json',

                            'X-CSRF-Token':
                                csrfToken
                        },

                        credentials:
                            'same-origin',

                        cache:
                            'no-store',

                        body:
                            JSON.stringify(
                                requestBody
                            )
                    }
                );

            console.log(
                '[Cryptiva] Share update response:',
                response.status,
                response.statusText
            );

            const data =
                await parseResponse(
                    response
                );

            console.log(
                '[Cryptiva] Share update data:',
                data
            );

            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Unable to update secure share.'
                );
            }

            closeEditModal();

            showToast(
                data.updated
                    ? 'Share settings updated successfully.'
                    : 'Secure share created successfully.',
                'success'
            );

            await loadSharedFiles();

        } catch (error) {

            console.error(
                'Share update error:',
                error
            );

            showEditError(
                error.message ||
                'Unable to update secure share.'
            );

        } finally {

            if (elements.editSubmit) {

                elements.editSubmit.disabled =
                    false;

                elements.editSubmit.textContent =
                    'Update secure link';
            }
        }
    }

    /*
    |--------------------------------------------------------------------------
    | EDIT ERROR
    |--------------------------------------------------------------------------
    */

    function showEditError(message) {

        if (!elements.editError) {
            return;
        }

        elements.editError.textContent =
            message;

        elements.editError.classList.add(
            'visible'
        );
    }

    function clearEditError() {

        if (!elements.editError) {
            return;
        }

        elements.editError.textContent = '';

        elements.editError.classList.remove(
            'visible'
        );
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

        return meta
            ? (
                meta.getAttribute(
                    'content'
                ) || ''
            ).trim()
            : '';
    }

    /*
    |--------------------------------------------------------------------------
    | STATES
    |--------------------------------------------------------------------------
    */

    function showLoading() {

        if (elements.loading) {

            elements.loading.classList.remove(
                'hidden'
            );
        }

        if (elements.empty) {

            elements.empty.classList.add(
                'hidden'
            );
        }

        if (elements.tableWrap) {

            elements.tableWrap.classList.add(
                'hidden'
            );
        }
    }

    function showEmpty(
        title,
        message
    ) {

        hideAllStates();

        const titleElement =
            elements.empty
                ? elements.empty.querySelector('h3')
                : null;

        const messageElement =
            elements.empty
                ? elements.empty.querySelector('p')
                : null;

        if (titleElement) {
            titleElement.textContent =
                title;
        }

        if (messageElement) {
            messageElement.textContent =
                message;
        }

        if (elements.empty) {

            elements.empty.classList.remove(
                'hidden'
            );
        }
    }

    function hideAllStates() {

        if (elements.loading) {

            elements.loading.classList.add(
                'hidden'
            );
        }

        if (elements.empty) {

            elements.empty.classList.add(
                'hidden'
            );
        }

        if (elements.tableWrap) {

            elements.tableWrap.classList.add(
                'hidden'
            );
        }
    }

    function renderError(message) {

        showEmpty(
            'Unable to load shared files',
            message
        );
    }

    /*
    |--------------------------------------------------------------------------
    | TOAST
    |--------------------------------------------------------------------------
    */

    function showToast(
        message,
        type
    ) {

        if (!elements.toastRegion) {
            return;
        }

        const toast =
            document.createElement('div');

        toast.className =
            `shared-toast ${type || ''}`;

        toast.textContent =
            message;

        elements.toastRegion.appendChild(
            toast
        );

        setTimeout(
            () => {
                toast.remove();
            },
            3000
        );
    }

    /*
    |--------------------------------------------------------------------------
    | FORMAT
    |--------------------------------------------------------------------------
    */

    function formatSize(bytes) {

        const value =
            Number(bytes || 0);

        if (value < 1024) {
            return `${value} B`;
        }

        if (value < 1024 * 1024) {

            return `${(
                value /
                1024
            ).toFixed(1)} KB`;
        }

        if (value < 1024 * 1024 * 1024) {

            return `${(
                value /
                (
                    1024 *
                    1024
                )
            ).toFixed(1)} MB`;
        }

        return `${(
            value /
            (
                1024 *
                1024 *
                1024
            )
        ).toFixed(2)} GB`;
    }

    function formatDate(value) {

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

        return date.toLocaleDateString(
            undefined,
            {
                day: 'numeric',
                month: 'short',
                year: 'numeric'
            }
        );
    }

    function formatFullDate(value) {

        const date =
            value instanceof Date
                ? value
                : new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return 'soon';
        }

        return date.toLocaleString(
            undefined,
            {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: 'numeric',
                minute: '2-digit'
            }
        );
    }

    function formatExpiry(value) {

        if (!value) {

            return {
                label: 'No expiry',
                detail: 'Link does not expire',
                className: ''
            };
        }

        const date =
            new Date(value);

        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return {
                label: 'Unknown',
                detail: '',
                className: ''
            };
        }

        const difference =
            date.getTime() -
            Date.now();

        if (difference <= 0) {

            return {
                label: 'Expired',
                detail: formatDate(value),
                className: 'expired'
            };
        }

        const hours =
            Math.ceil(
                difference /
                (
                    1000 *
                    60 *
                    60
                )
            );

        if (hours <= 24) {

            return {
                label: `Expires in ${hours}h`,
                detail: formatDate(value),
                className: 'expiring'
            };
        }

        const days =
            Math.ceil(
                hours / 24
            );

        return {
            label: `Expires in ${days}d`,
            detail: formatDate(value),
            className: ''
        };
    }

    /*
    |--------------------------------------------------------------------------
    | ESCAPE
    |--------------------------------------------------------------------------
    */

    function escapeHtml(value) {

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

    /*
    |--------------------------------------------------------------------------
    | RESPONSE
    |--------------------------------------------------------------------------
    */

    async function parseResponse(response) {

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
                `Request failed with status ${response.status}`
        };
    }

    /*
    |--------------------------------------------------------------------------
    | START
    |--------------------------------------------------------------------------
    */

    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init
        );

    } else {

        init();
    }

})();