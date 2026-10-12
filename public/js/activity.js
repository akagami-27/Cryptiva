(() => {

    'use strict';


    /* =========================================================
       STATE
       ========================================================= */

    const state = {

        page:
            1,

        limit:
            20,

        total:
            0,

        pages:
            1,

        loading:
            false,

        search:
            '',

        action:
            '',

        status:
            '',

        searchTimer:
            null,

        expanded:
            new Set()

    };


    /* =========================================================
       ELEMENTS
       ========================================================= */

    const elements = {

        list:
            document.getElementById(
                'activity-list'
            ),

        search:
            document.getElementById(
                'activity-search'
            ),

        action:
            document.getElementById(
                'activity-action'
            ),

        status:
            document.getElementById(
                'activity-status'
            ),

        refresh:
            document.getElementById(
                'activity-refresh'
            ),

        previous:
            document.getElementById(
                'activity-prev'
            ),

        next:
            document.getElementById(
                'activity-next'
            ),

        page:
            document.getElementById(
                'activity-page'
            ),

        pages:
            document.getElementById(
                'activity-pages'
            ),

        total:
            document.getElementById(
                'activity-total'
            ),

        success:
            document.getElementById(
                'activity-success'
            ),

        failed:
            document.getElementById(
                'activity-failed'
            )

    };


    /* =========================================================
       ICONS
       ========================================================= */

    const icons = {

        login: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M10 5H6.5A1.5 1.5 0 0 0 5 6.5v11A1.5 1.5 0 0 0 6.5 19H10"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
                <path
                    d="M14 8l4 4-4 4M18 12H9"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `,


        logout: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M14 5h3.5A1.5 1.5 0 0 1 19 6.5v11a1.5 1.5 0 0 1-1.5 1.5H14"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
                <path
                    d="M10 8l-4 4 4 4M6 12h9"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `,


        upload: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M12 15V4"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />
                <path
                    d="m8 8 4-4 4 4"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
                <path
                    d="M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />
            </svg>
        `,


        download: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M12 4v11"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />
                <path
                    d="m8 11 4 4 4-4"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
                <path
                    d="M5 19h14"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />
            </svg>
        `,


        delete: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M5 7h14M9 7V5h6v2M8 10v7M12 10v7M16 10v7"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
                <path
                    d="M7 7l.7 12h8.6L17 7"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />
            </svg>
        `,


        share: `
            <svg viewBox="0 0 24 24" fill="none">
                <circle
                    cx="18"
                    cy="5"
                    r="2.2"
                    stroke="currentColor"
                    stroke-width="1.7"
                />
                <circle
                    cx="6"
                    cy="12"
                    r="2.2"
                    stroke="currentColor"
                    stroke-width="1.7"
                />
                <circle
                    cx="18"
                    cy="19"
                    r="2.2"
                    stroke="currentColor"
                    stroke-width="1.7"
                />
                <path
                    d="m8 11 7.8-4.5M8 13l7.8 4.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
            </svg>
        `,


        lock: `
            <svg viewBox="0 0 24 24" fill="none">
                <rect
                    x="4"
                    y="10"
                    width="16"
                    height="10"
                    rx="2"
                    stroke="currentColor"
                    stroke-width="1.7"
                />
                <path
                    d="M8 10V7a4 4 0 0 1 8 0v3"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
            </svg>
        `,


        security: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M12 3 19 6v5.5c0 4.4-2.8 7.6-7 9.5-4.2-1.9-7-5.1-7-9.5V6l7-3Z"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />
                <path
                    d="m9 12 2 2 4-4"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `,


        file: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M6 3h8l4 4v14H6z"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />
                <path
                    d="M14 3v5h4"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />
            </svg>
        `,


        activity: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M5 12h4l2-7 3 14 2-7h3"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `,


        alert: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="M12 4 21 19H3L12 4Z"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />
                <path
                    d="M12 9v4"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
                <circle
                    cx="12"
                    cy="16"
                    r="0.8"
                    fill="currentColor"
                />
            </svg>
        `,


        chevron: `
            <svg viewBox="0 0 24 24" fill="none">
                <path
                    d="m9 18 6-6-6-6"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `

    };


    /* =========================================================
       ESCAPE HTML
       ========================================================= */

    function escapeHtml(value) {

        return String(
            value ?? ''
        )
            .replace(
                /&/g,
                '&amp;'
            )
            .replace(
                /</g,
                '&lt;'
            )
            .replace(
                />/g,
                '&gt;'
            )
            .replace(
                /"/g,
                '&quot;'
            )
            .replace(
                /'/g,
                '&#039;'
            );

    }


    /* =========================================================
       ACTION LABEL
       ========================================================= */

    function actionLabel(
        action
    ) {

        const labels = {

            login_success:
                'Login successful',

            login_failed:
                'Login failed',

            logout:
                'Logout',

            file_upload:
                'File uploaded',

            file_download:
                'File downloaded',

            file_delete:
                'File deleted',

            share_created:
                'Share created',

            share_updated:
                'Share updated',

            share_accessed:
                'Share accessed',

            share_password_failed:
                'Share password failed',

            share_download:
                'Shared file downloaded',

            share_download_limit_reached:
                'Download limit reached',

            share_expired:
                'Share expired',

            share_revoked:
                'Share revoked',

            password_changed:
                'Password changed',

            profile_updated:
                'Profile updated',

            security_event:
                'Security event'

        };


        return labels[action] ||
            String(
                action ||
                'Activity'
            )
                .replace(
                    /_/g,
                    ' '
                )
                .replace(
                    /\b\w/g,
                    c =>
                        c.toUpperCase()
                );

    }


    /* =========================================================
       ACTION ICON
       ========================================================= */

    function actionIcon(
        action
    ) {

        if (
            action ===
                'login_success' ||
            action ===
                'login_failed'
        ) {

            return icons.login;

        }


        if (
            action ===
            'logout'
        ) {

            return icons.logout;

        }


        if (
            action ===
            'file_upload'
        ) {

            return icons.upload;

        }


        if (
            action ===
                'file_download' ||
            action ===
                'share_download'
        ) {

            return icons.download;

        }


        if (
            action ===
            'file_delete'
        ) {

            return icons.delete;

        }


        if (
            action ===
                'share_created' ||
            action ===
                'share_updated' ||
            action ===
                'share_accessed'
        ) {

            return icons.share;

        }


        if (
            action ===
                'share_password_failed' ||
            action ===
                'share_expired' ||
            action ===
                'share_revoked'
        ) {

            return icons.lock;

        }


        if (
            action ===
            'security_event'
        ) {

            return icons.security;

        }


        if (
            action ===
            'password_changed'
        ) {

            return icons.lock;

        }


        return icons.activity;

    }


    /* =========================================================
       STATUS CLASS
       ========================================================= */

    function statusClass(
        status
    ) {

        const value =
            String(
                status ||
                'success'
            ).toLowerCase();


        if (
            value === 'failed' ||
            value === 'blocked' ||
            value === 'denied'
        ) {

            return value;

        }


        return 'success';

    }


    /* =========================================================
       FORMAT DATE
       ========================================================= */

    function formatDate(
        value
    ) {

        if (!value) {

            return 'Unknown';

        }


        const date =
            new Date(
                value
            );


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return 'Unknown';

        }


        return new Intl.DateTimeFormat(
            undefined,
            {
                dateStyle:
                    'medium',

                timeStyle:
                    'short'
            }
        ).format(
            date
        );

    }


    /* =========================================================
       RELATIVE TIME
       ========================================================= */

    function relativeTime(
        value
    ) {

        if (!value) {

            return '';

        }


        const date =
            new Date(
                value
            );


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {

            return '';

        }


        const difference =
            Date.now() -
            date.getTime();


        if (
            difference < 0
        ) {

            return formatDate(
                value
            );

        }


        const seconds =
            Math.floor(
                difference /
                1000
            );


        if (
            seconds < 60
        ) {

            return 'Just now';

        }


        const minutes =
            Math.floor(
                seconds /
                60
            );


        if (
            minutes < 60
        ) {

            return `${minutes}m ago`;

        }


        const hours =
            Math.floor(
                minutes /
                60
            );


        if (
            hours < 24
        ) {

            return `${hours}h ago`;

        }


        const days =
            Math.floor(
                hours /
                24
            );


        if (
            days < 7
        ) {

            return `${days}d ago`;

        }


        return formatDate(
            value
        );

    }


    /* =========================================================
       DEVICE PARSER
       ========================================================= */

    function parseUserAgent(
        userAgent
    ) {

        if (!userAgent) {

            return 'Unknown device';

        }


        const ua =
            String(
                userAgent
            );


        let browser =
            'Unknown browser';


        let os =
            'Unknown OS';


        /*
        |--------------------------------------------------------------------------
        | Browser
        |--------------------------------------------------------------------------
        */

        if (
            /Edg\//i.test(
                ua
            )
        ) {

            browser =
                'Microsoft Edge';

        } else if (
            /Brave/i.test(
                ua
            )
        ) {

            browser =
                'Brave';

        } else if (
            /OPR\//i.test(
                ua
            )
        ) {

            browser =
                'Opera';

        } else if (
            /Chrome\//i.test(
                ua
            )
        ) {

            browser =
                'Google Chrome';

        } else if (
            /Firefox\//i.test(
                ua
            )
        ) {

            browser =
                'Firefox';

        } else if (
            /Safari\//i.test(
                ua
            ) &&
            !/Chrome/i.test(
                ua
            )
        ) {

            browser =
                'Safari';

        }


        /*
        |--------------------------------------------------------------------------
        | Operating System
        |--------------------------------------------------------------------------
        */

        if (
            /Windows NT/i.test(
                ua
            )
        ) {

            os =
                'Windows';

        } else if (
            /Android/i.test(
                ua
            )
        ) {

            os =
                'Android';

        } else if (
            /iPhone|iPad|iPod/i.test(
                ua
            )
        ) {

            os =
                'iOS';

        } else if (
            /Mac OS X/i.test(
                ua
            )
        ) {

            os =
                'macOS';

        } else if (
            /Linux/i.test(
                ua
            )
        ) {

            os =
                'Linux';

        }


        return `${browser} · ${os}`;

    }


    /* =========================================================
       DETAILS VALUE
       ========================================================= */

    function detailRow(
        label,
        value
    ) {

        const safeValue =
            value === null ||
            value === undefined ||
            value === ''
                ? 'Not available'
                : String(
                    value
                );


        return `

            <div class="activity-detail-item">

                <span class="activity-detail-label">

                    ${escapeHtml(label)}

                </span>

                <span class="activity-detail-value">

                    ${escapeHtml(safeValue)}

                </span>

            </div>

        `;

    }


    /* =========================================================
       RENDER DETAILS
       ========================================================= */

    function renderDetails(
        activity
    ) {

        const username =
            activity.username ||
            'Unknown user';


        const file =
            activity.fileName ||
            'No file specified';


        const device =
            parseUserAgent(
                activity.userAgent
            );


        const exactTime =
            formatDate(
                activity.createdAt
            );


        return `

            <div
                class="activity-details"
                data-details-for="${escapeHtml(
                    activity.id
                )}"
            >

                <div class="activity-details-grid">

                    ${detailRow(
                        'User',
                        username
                    )}

                    ${detailRow(
                        'Action',
                        actionLabel(
                            activity.action
                        )
                    )}

                    ${detailRow(
                        'Status',
                        activity.status
                    )}

                    ${detailRow(
                        'File',
                        file
                    )}


                    ${detailRow(
                        'Device',
                        device
                    )}

                    ${detailRow(
                        'Time',
                        exactTime
                    )}

                </div>


                <div class="activity-detail-description">

                    <span>
                        Description
                    </span>

                    <p>
                        ${escapeHtml(
                            activity.description ||
                            'No additional description.'
                        )}
                    </p>

                </div>

            </div>

        `;

    }


    /* =========================================================
       TOGGLE DETAILS
       ========================================================= */

    function toggleDetails(
        id
    ) {

        if (
            state.expanded.has(
                id
            )
        ) {

            state.expanded.delete(
                id
            );

        } else {

            state.expanded.add(
                id
            );

        }


        const row =
            document.querySelector(
                `[data-activity-id="${CSS.escape(
                    id
                )}"]`
            );


        if (!row) {

            return;

        }


        const details =
            row.querySelector(
                '.activity-details'
            );


        const button =
            row.querySelector(
                '.activity-details-button'
            );


        const isExpanded =
            state.expanded.has(
                id
            );


        if (details) {

            details.hidden =
                !isExpanded;

        }


        if (button) {

            button.setAttribute(
                'aria-expanded',
                String(
                    isExpanded
                )
            );


            button.classList.toggle(
                'open',
                isExpanded
            );


            button.querySelector(
                '.activity-details-chevron'
            ).innerHTML =
                isExpanded
                    ? `
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                        >
                            <path
                                d="m18 15-6-6-6 6"
                                stroke="currentColor"
                                stroke-width="1.8"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                            />
                        </svg>
                    `
                    : icons.chevron;

        }

    }


    /* =========================================================
       RENDER ACTIVITY
       ========================================================= */

    function renderActivity(
        activity
    ) {

        const action =
            activity.action ||
            'activity';


        const status =
            statusClass(
                activity.status
            );


        const title =
            actionLabel(
                action
            );


        const description =
            activity.description ||
            `${title}.`;


        const date =
            activity.createdAt;


        const fileName =
            activity.fileName ||
            '';


        const username =
            activity.username ||
            'Unknown user';


        const expanded =
            state.expanded.has(
                activity.id
            );


        return `

            <article
                class="activity-row-wrapper"
                data-activity-id="${escapeHtml(
                    activity.id
                )}"
            >

                <div class="activity-row">


                    <div
                        class="activity-row-icon ${status}"
                    >

                        ${actionIcon(action)}

                    </div>


                    <div class="activity-row-main">


                        <div class="activity-row-title">

                            ${escapeHtml(title)}

                        </div>


                        <div class="activity-row-description">

                            ${escapeHtml(description)}

                        </div>


                        ${
                            fileName
                                ? `
                                    <div
                                        class="activity-row-file"
                                        title="${escapeHtml(
                                            fileName
                                        )}"
                                    >

                                        ${icons.file}

                                        <span>
                                            ${escapeHtml(
                                                fileName
                                            )}
                                        </span>

                                    </div>
                                `
                                : ''
                        }


                    </div>


                    <div class="activity-row-meta">


                        <span
                            class="activity-status ${status}"
                        >

                            ${escapeHtml(
                                activity.status ||
                                'success'
                            )}

                        </span>


                        <span
                            class="activity-row-time"
                            title="${escapeHtml(
                                formatDate(date)
                            )}"
                        >

                            ${escapeHtml(
                                relativeTime(date)
                            )}

                        </span>


                        <button
                            type="button"
                            class="activity-details-button ${
                                expanded
                                    ? 'open'
                                    : ''
                            }"
                            data-action="details"
                            data-id="${escapeHtml(
                                activity.id
                            )}"
                            aria-expanded="${String(
                                expanded
                            )}"
                        >

                            <span>
                                ${
                                    expanded
                                        ? 'Hide details'
                                        : 'View details'
                                }
                            </span>

                            <span class="activity-details-chevron">

                                ${
                                    expanded
                                        ? `
                                            <svg
                                                viewBox="0 0 24 24"
                                                fill="none"
                                            >
                                                <path
                                                    d="m18 15-6-6-6 6"
                                                    stroke="currentColor"
                                                    stroke-width="1.8"
                                                    stroke-linecap="round"
                                                    stroke-linejoin="round"
                                                />
                                            </svg>
                                        `
                                        : icons.chevron
                                }

                            </span>

                        </button>


                    </div>


                </div>


                <div
                    class="activity-details"
                    ${
                        expanded
                            ? ''
                            : 'hidden'
                    }
                >

                    ${renderDetails(
                        activity
                    )}

                </div>

            </article>

        `;

    }


    /* =========================================================
       RENDER ACTIVITIES
       ========================================================= */

    function renderActivities(
        activities
    ) {

        if (!elements.list) {

            return;

        }


        if (
            !activities.length
        ) {

            renderState(
                'No activity found',
                state.search ||
                state.action ||
                state.status
                    ? 'Try changing your search or filters.'
                    : 'Your recorded activity will appear here.',
                'empty'
            );

            return;

        }


        elements.list.innerHTML =
            activities
                .map(
                    renderActivity
                )
                .join('');

    }


    /* =========================================================
       STATE
       ========================================================= */

    function renderState(
        title,
        message,
        type = 'empty',
        retry = false
    ) {

        const icon =
            type === 'error'
                ? icons.alert
                : icons.activity;


        elements.list.innerHTML = `

            <div class="activity-state ${type}">

                <div class="activity-state-icon">

                    ${icon}

                </div>

                <strong>
                    ${escapeHtml(title)}
                </strong>

                <span>
                    ${escapeHtml(message)}
                </span>

                ${
                    retry
                        ? `
                            <button
                                type="button"
                                class="activity-state-button"
                                id="activity-retry"
                            >
                                Retry
                            </button>
                        `
                        : ''
                }

            </div>

        `;


        const retryButton =
            document.getElementById(
                'activity-retry'
            );


        if (retryButton) {

            retryButton.addEventListener(
                'click',
                loadActivity
            );

        }

    }


    /* =========================================================
       UPDATE STATS
       ========================================================= */

    function updateStats(
        data,
        activities
    ) {

        const total =
            Number(
                data.total ?? 0
            );


        const success =
            Number(
                data.successCount ?? 0
            );


        const failed =
            Number(
                data.failedCount ?? 0
            );


        elements.total.textContent =
            Number.isFinite(
                total
            )
                ? total
                : activities.length;


        elements.success.textContent =
            Number.isFinite(
                success
            )
                ? success
                : 0;


        elements.failed.textContent =
            Number.isFinite(
                failed
            )
                ? failed
                : 0;

    }


    /* =========================================================
       PAGINATION
       ========================================================= */

    function updatePagination(
        data
    ) {

        state.total =
            Number(
                data.total || 0
            );


        state.pages =
            Math.max(
                1,
                Number(
                    data.pages || 1
                )
            );


        state.page =
            Number(
                data.page ||
                state.page
            );


        elements.page.textContent =
            state.page;


        elements.pages.textContent =
            state.pages;


        elements.previous.disabled =
            state.loading ||
            state.page <= 1;


        elements.next.disabled =
            state.loading ||
            state.page >= state.pages;

    }


    /* =========================================================
       LOAD
       ========================================================= */

    async function loadActivity() {

        if (
            state.loading
        ) {

            return;

        }


        state.loading =
            true;


        elements.refresh.disabled =
            true;


        elements.previous.disabled =
            true;


        elements.next.disabled =
            true;


        renderState(
            'Loading activity...',
            'Retrieving your security activity.',
            'loading'
        );


        try {

            const params =
                new URLSearchParams();


            params.set(
                'page',
                String(
                    state.page
                )
            );


            params.set(
                'limit',
                String(
                    state.limit
                )
            );


            if (
                state.search
            ) {

                params.set(
                    'search',
                    state.search
                );

            }


            if (
                state.action
            ) {

                params.set(
                    'action',
                    state.action
                );

            }


            if (
                state.status
            ) {

                params.set(
                    'status',
                    state.status
                );

            }


            const response =
                await fetch(
                    `/activity/data?${params.toString()}`,
                    {
                        method:
                            'GET',

                        headers: {
                            Accept:
                                'application/json'
                        },

                        credentials:
                            'same-origin',

                        cache:
                            'no-store'
                    }
                );


            const data =
                await response.json();


            if (
                !response.ok
            ) {

                throw new Error(
                    data.error ||
                    'Unable to load activity.'
                );

            }


            const activities =
                Array.isArray(
                    data.activities
                )
                    ? data.activities
                    : [];


            updateStats(
                data,
                activities
            );


            updatePagination(
                data
            );


            renderActivities(
                activities
            );


        } catch (error) {

            console.error(
                'Activity error:',
                error
            );


            renderState(
                'Unable to load activity',
                error.message ||
                'An unexpected error occurred.',
                'error',
                true
            );

        } finally {

            state.loading =
                false;


            elements.refresh.disabled =
                false;


            elements.previous.disabled =
                state.page <= 1;


            elements.next.disabled =
                state.page >= state.pages;

        }

    }


    /* =========================================================
       EVENT HANDLERS
       ========================================================= */

    function bindSearch() {

        if (
            !elements.search
        ) {

            return;

        }


        elements.search.addEventListener(
            'input',
            () => {

                clearTimeout(
                    state.searchTimer
                );


                state.searchTimer =
                    setTimeout(
                        () => {

                            state.search =
                                elements.search.value
                                    .trim();


                            state.page =
                                1;


                            state.expanded.clear();


                            loadActivity();

                        },
                        350
                    );

            }
        );

    }


    function bindFilters() {

        if (
            elements.action
        ) {

            elements.action.addEventListener(
                'change',
                () => {

                    state.action =
                        elements.action.value;


                    state.page =
                        1;


                    state.expanded.clear();


                    loadActivity();

                }
            );

        }


        if (
            elements.status
        ) {

            elements.status.addEventListener(
                'change',
                () => {

                    state.status =
                        elements.status.value;


                    state.page =
                        1;


                    state.expanded.clear();


                    loadActivity();

                }
            );

        }

    }


    function bindPagination() {

        elements.previous.addEventListener(
            'click',
            () => {

                if (
                    state.page <= 1 ||
                    state.loading
                ) {

                    return;

                }


                state.page--;

                state.expanded.clear();

                loadActivity();

            }
        );


        elements.next.addEventListener(
            'click',
            () => {

                if (
                    state.page >= state.pages ||
                    state.loading
                ) {

                    return;

                }


                state.page++;

                state.expanded.clear();

                loadActivity();

            }
        );

    }


    function bindRefresh() {

        elements.refresh.addEventListener(
            'click',
            () => {

                state.expanded.clear();

                loadActivity();

            }
        );

    }


    function bindActivityDetails() {

        elements.list.addEventListener(
            'click',
            event => {

                const button =
                    event.target.closest(
                        '[data-action="details"]'
                    );


                if (!button) {

                    return;

                }


                const id =
                    button.dataset.id;


                if (!id) {

                    return;

                }


                toggleDetails(
                    id
                );

            }
        );

    }


    /* =========================================================
       INIT
       ========================================================= */

    function init() {

        bindSearch();

        bindFilters();

        bindPagination();

        bindRefresh();

        bindActivityDetails();

        loadActivity();

    }


    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            init,
            {
                once:
                    true
            }
        );

    } else {

        init();

    }

})();