(function () {

    'use strict';


    /* =========================================================
       ICONS
       ========================================================= */

    const icons = {

        dashboard: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <rect
                    x="3"
                    y="3"
                    width="7"
                    height="7"
                    rx="1.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <rect
                    x="14"
                    y="3"
                    width="7"
                    height="7"
                    rx="1.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <rect
                    x="3"
                    y="14"
                    width="7"
                    height="7"
                    rx="1.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <rect
                    x="14"
                    y="14"
                    width="7"
                    height="7"
                    rx="1.5"
                    stroke="currentColor"
                    stroke-width="1.7"
                />
            </svg>
        `,


        files: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path
                    d="M5 4.5A2.5 2.5 0 0 1 7.5 2H14l5 5v12.5A2.5 2.5 0 0 1 16.5 22h-9A2.5 2.5 0 0 1 5 19.5V4.5Z"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />

                <path
                    d="M14 2v5h5"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linejoin="round"
                />

                <path
                    d="M8.5 13h7M8.5 17h5"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
            </svg>
        `,


        shared: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <circle
                    cx="8"
                    cy="12"
                    r="3"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <circle
                    cx="16"
                    cy="6"
                    r="3"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <circle
                    cx="16"
                    cy="18"
                    r="3"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <path
                    d="m10.6 10.5 2.8-2.1M10.6 13.5l2.8 2.1"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
            </svg>
        `,


        activity: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path
                    d="M4 12h3l2-6 4 12 2-6h5"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `,


        profile: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <circle
                    cx="12"
                    cy="8"
                    r="3.2"
                    stroke="currentColor"
                    stroke-width="1.7"
                />

                <path
                    d="M5.5 20c.8-3.5 3-5.3 6.5-5.3s5.7 1.8 6.5 5.3"
                    stroke="currentColor"
                    stroke-width="1.7"
                    stroke-linecap="round"
                />
            </svg>
        `,


        security: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path
                    d="M12 3 19 6v5.5c0 4.7-2.9 7.9-7 9.5-4.1-1.6-7-4.8-7-9.5V6l7-3Z"
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


        logout: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
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


        menu: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path
                    d="M4 7h16M4 12h16M4 17h16"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />
            </svg>
        `,


        close: `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path
                    d="m6 6 12 12M18 6 6 18"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                />
            </svg>
        `
    };


    /* =========================================================
       NAVIGATION
       ========================================================= */

    const navigation = [

        {
            label: 'Dashboard',
            href: '/dashboard',
            icon: 'dashboard',
            key: 'dashboard'
        },

        {
            label: 'Files',
            href: '/files',
            icon: 'files',
            key: 'files'
        },

        {
            label: 'Shared Files',
            href: '/shared',
            icon: 'shared',
            key: 'shared'
        },

        {
            label: 'Activity',
            href: '/activity',
            icon: 'activity',
            key: 'activity'
        }

    ];


    const accountNavigation = [

        {
            label: 'Profile',
            href: '/profile',
            icon: 'profile',
            key: 'profile'
        },

        {
            label: 'Security',
            href: '/security',
            icon: 'security',
            key: 'security'
        }

    ];


    /* =========================================================
       ACTIVE PAGE
       ========================================================= */

    function getCurrentPage() {

        const path =
            window.location.pathname
                .replace(/\/+$/, '') ||
            '/';

        if (
            path === '/dashboard' ||
            path === ''
        ) {
            return 'dashboard';
        }

        if (
            path === '/files' ||
            path.startsWith('/files/')
        ) {
            return 'files';
        }

        if (
            path === '/shared' ||
            path.startsWith('/shared/')
        ) {
            return 'shared';
        }

        if (
            path === '/activity' ||
            path.startsWith('/activity/')
        ) {
            return 'activity';
        }

        if (
            path === '/profile' ||
            path.startsWith('/profile/')
        ) {
            return 'profile';
        }

        if (
            path === '/security' ||
            path.startsWith('/security/')
        ) {
            return 'security';
        }

        return '';
    }


    /* =========================================================
       ESCAPE HTML
       ========================================================= */

    function escapeHtml(value) {

        return String(value || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');

    }


    /* =========================================================
       NAV ITEM
       ========================================================= */

    function createNavItem(item, activePage) {

        const active =
            item.key === activePage;

        return `
            <a
                class="sidebar-link${active ? ' active' : ''}"
                href="${item.href}"
                ${active ? 'aria-current="page"' : ''}
            >

                <span class="sidebar-icon">
                    ${icons[item.icon]}
                </span>

                <span class="sidebar-link-text">
                    ${escapeHtml(item.label)}
                </span>

            </a>
        `;

    }


    /* =========================================================
       SIDEBAR
       ========================================================= */

    function createSidebar() {

        const activePage =
            getCurrentPage();


        const sidebar =
            document.createElement('aside');

        sidebar.className =
            'cryptiva-sidebar';

        sidebar.id =
            'cryptiva-sidebar';


        sidebar.innerHTML = `

            <a
                class="sidebar-brand"
                href="/dashboard"
                aria-label="Cryptiva Dashboard"
            >

                <span class="sidebar-brand-icon">
                    ◈
                </span>

                <span class="sidebar-brand-text">

                    <span class="sidebar-brand-name">
                        CRYPTIVA
                    </span>

                    <span class="sidebar-brand-subtitle">
                        SECURE VAULT
                    </span>

                </span>

            </a>


            <div class="sidebar-section">

                <div class="sidebar-section-label">
                    Main
                </div>

                <nav
                    class="sidebar-nav"
                    aria-label="Main navigation"
                >

                    ${navigation
                        .map(
                            item =>
                                createNavItem(
                                    item,
                                    activePage
                                )
                        )
                        .join('')}

                </nav>

            </div>


            <div class="sidebar-section">

                <div class="sidebar-section-label">
                    Account
                </div>

                <nav
                    class="sidebar-nav"
                    aria-label="Account navigation"
                >

                    ${accountNavigation
                        .map(
                            item =>
                                createNavItem(
                                    item,
                                    activePage
                                )
                        )
                        .join('')}

                </nav>

            </div>


            <div class="sidebar-spacer"></div>


            <div class="sidebar-user">

                <div class="sidebar-user-card">

                    <div
                        class="sidebar-user-avatar"
                        id="sidebar-user-avatar"
                    >
                        —
                    </div>

                    <div class="sidebar-user-info">

                        <div
                            class="sidebar-user-name"
                            id="sidebar-user-name"
                        >
                            Loading...
                        </div>

                        <div class="sidebar-user-status">

                            <span
                                class="sidebar-status-dot"
                            ></span>

                            Secure session

                        </div>

                    </div>

                </div>


                <form
                    action="/logout"
                    method="POST"
                    id="sidebar-logout-form"
                >

                    <input
                        type="hidden"
                        name="_csrf"
                        id="sidebar-csrf"
                    >

                    <button
                        class="sidebar-logout"
                        type="submit"
                    >

                        <span class="sidebar-icon">
                            ${icons.logout}
                        </span>

                        <span class="sidebar-link-text">
                            Sign out
                        </span>

                    </button>

                </form>

            </div>

        `;


        return sidebar;

    }


    /* =========================================================
       MOBILE BAR
       ========================================================= */

    function createMobileBar() {

        const bar =
            document.createElement('div');

        bar.className =
            'sidebar-mobile-bar';

        bar.id =
            'sidebar-mobile-bar';


        bar.innerHTML = `

            <a
                class="sidebar-mobile-brand"
                href="/dashboard"
            >

                <span class="sidebar-mobile-brand-icon">
                    ◈
                </span>

                <span class="sidebar-mobile-brand-text">
                    CRYPTIVA
                </span>

            </a>


            <button
                class="sidebar-menu-button"
                id="sidebar-menu-button"
                type="button"
                aria-label="Open navigation"
                aria-expanded="false"
            >

                ${icons.menu}

            </button>

        `;


        return bar;

    }


    /* =========================================================
       OVERLAY
       ========================================================= */

    function createOverlay() {

        const overlay =
            document.createElement('div');

        overlay.className =
            'sidebar-overlay';

        overlay.id =
            'sidebar-overlay';

        return overlay;

    }


    /* =========================================================
       USER INFORMATION
       ========================================================= */

    async function loadUser() {

        try {

            const response =
                await fetch(
                    '/me',
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


            if (!response.ok) {
                return;
            }


            const data =
                await response.json();


            if (
                !data ||
                !data.user
            ) {
                return;
            }


            const username =
                data.user.username ||
                'User';


            const nameElement =
                document.getElementById(
                    'sidebar-user-name'
                );


            const avatarElement =
                document.getElementById(
                    'sidebar-user-avatar'
                );


            if (nameElement) {

                nameElement.textContent =
                    username;

            }


            if (avatarElement) {

                avatarElement.textContent =
                    username
                        .charAt(0)
                        .toUpperCase();

            }


        } catch (error) {

            console.error(
                'Sidebar user information error:',
                error
            );

        }

    }


    /* =========================================================
       CSRF
       ========================================================= */

    function getCsrfToken() {

        const meta =
            document.querySelector(
                'meta[name="csrf-token"]'
            );


        if (!meta) {
            return '';
        }


        return (
            meta
                .getAttribute('content') ||
            ''
        ).trim();

    }


    function setupCsrf() {

        const input =
            document.getElementById(
                'sidebar-csrf'
            );


        if (!input) {
            return;
        }


        input.value =
            getCsrfToken();

    }


    /* =========================================================
       MOBILE CONTROLS
       ========================================================= */

    function setupMobileControls() {

        const sidebar =
            document.getElementById(
                'cryptiva-sidebar'
            );

        const button =
            document.getElementById(
                'sidebar-menu-button'
            );

        const overlay =
            document.getElementById(
                'sidebar-overlay'
            );


        if (
            !sidebar ||
            !button ||
            !overlay
        ) {
            return;
        }


        function openSidebar() {

            sidebar.classList.add(
                'mobile-open'
            );

            overlay.classList.add(
                'active'
            );

            button.innerHTML =
                icons.close;

            button.setAttribute(
                'aria-expanded',
                'true'
            );

            document.body.style.overflow =
                'hidden';

        }


        function closeSidebar() {

            sidebar.classList.remove(
                'mobile-open'
            );

            overlay.classList.remove(
                'active'
            );

            button.innerHTML =
                icons.menu;

            button.setAttribute(
                'aria-expanded',
                'false'
            );

            document.body.style.overflow =
                '';

        }


        button.addEventListener(
            'click',
            () => {

                if (
                    sidebar.classList.contains(
                        'mobile-open'
                    )
                ) {

                    closeSidebar();

                } else {

                    openSidebar();

                }

            }
        );


        overlay.addEventListener(
            'click',
            closeSidebar
        );


        sidebar
            .querySelectorAll(
                '.sidebar-link'
            )
            .forEach(
                link => {

                    link.addEventListener(
                        'click',
                        closeSidebar
                    );

                }
            );


        document.addEventListener(
            'keydown',
            event => {

                if (
                    event.key === 'Escape'
                ) {

                    closeSidebar();

                }

            }
        );


        window.addEventListener(
            'resize',
            () => {

                if (
                    window.innerWidth > 900
                ) {

                    closeSidebar();

                }

            }
        );

    }


    /* =========================================================
       INIT
       ========================================================= */

    function init() {

        if (
            document.getElementById(
                'cryptiva-sidebar'
            )
        ) {
            return;
        }


        document.body.classList.add(
            'cryptiva-sidebar-active'
        );


        const sidebar =
            createSidebar();

        const mobileBar =
            createMobileBar();

        const overlay =
            createOverlay();


        document.body.prepend(
            overlay
        );

        document.body.prepend(
            sidebar
        );

        document.body.prepend(
            mobileBar
        );


        setupCsrf();

        setupMobileControls();

        loadUser();

    }


    /* =========================================================
       START
       ========================================================= */

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