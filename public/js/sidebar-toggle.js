(function () {
    'use strict';

    /* =========================================================
       CRYPTIVA SIDEBAR COLLAPSE / EXPAND
       ========================================================= */

    const STORAGE_KEY = 'cryptiva-sidebar-collapsed';
    const MOBILE_BREAKPOINT = 900;

    let sidebar = null;
    let collapseButton = null;


    /* =========================================================
       INJECT STYLES
       ========================================================= */

    function injectStyles() {
        if (document.getElementById('cryptiva-sidebar-toggle-styles')) {
            return;
        }

        const style = document.createElement('style');

        style.id = 'cryptiva-sidebar-toggle-styles';

        style.textContent = `
            /* =====================================================
               SIDEBAR BASE SAFETY
               ===================================================== */

            .cryptiva-sidebar {
                position: fixed !important;
                overflow: visible !important;
                z-index: 1000 !important;
            }

            /* Make sure the button can escape the sidebar */
            .cryptiva-sidebar,
            .cryptiva-sidebar * {
                box-sizing: border-box;
            }


            /* =====================================================
               DESKTOP SIDEBAR COLLAPSE
               ===================================================== */

            @media (min-width: 901px) {

                body.cryptiva-sidebar-active {
                    padding-left: var(--sidebar-width, 260px) !important;

                    transition:
                        padding-left 0.25s ease;
                }

                body.cryptiva-sidebar-active.cryptiva-sidebar-collapsed {
                    padding-left:
                        var(--sidebar-collapsed-width, 78px) !important;
                }


                /* Sidebar width */

                body.cryptiva-sidebar-collapsed
                .cryptiva-sidebar {
                    width:
                        var(--sidebar-collapsed-width, 78px) !important;

                    min-width:
                        var(--sidebar-collapsed-width, 78px) !important;

                    transition:
                        width 0.25s ease;
                }


                /* =================================================
                   BRAND
                   ================================================= */

                body.cryptiva-sidebar-collapsed
                .sidebar-brand {
                    justify-content: center;
                    padding-left: 0 !important;
                    padding-right: 0 !important;
                }

                body.cryptiva-sidebar-collapsed
                .sidebar-brand-text {
                    display: none !important;
                }


                /* =================================================
                   SECTION LABELS
                   ================================================= */

                body.cryptiva-sidebar-collapsed
                .sidebar-section-label {
                    display: none !important;
                }


                /* =================================================
                   NAV LINKS
                   ================================================= */

                body.cryptiva-sidebar-collapsed
                .sidebar-link {
                    justify-content: center !important;

                    padding-left: 0 !important;
                    padding-right: 0 !important;

                    gap: 0 !important;
                }

                body.cryptiva-sidebar-collapsed
                .sidebar-icon {
                    margin-right: 0 !important;
                    flex-shrink: 0;
                }

                body.cryptiva-sidebar-collapsed
                .sidebar-link-text {
                    display: none !important;
                }


                /* =================================================
                   ACTIVE LINK
                   ================================================= */

                body.cryptiva-sidebar-collapsed
                .sidebar-link.active::before {
                    left: 2px !important;
                }


                /* =================================================
                   USER CARD
                   ================================================= */

                body.cryptiva-sidebar-collapsed
                .sidebar-user-card {
                    justify-content: center !important;

                    padding-left: 0 !important;
                    padding-right: 0 !important;
                }

                body.cryptiva-sidebar-collapsed
                .sidebar-user-info {
                    display: none !important;
                }


                /* =================================================
                   LOGOUT
                   ================================================= */

                body.cryptiva-sidebar-collapsed
                .sidebar-logout {
                    justify-content: center !important;

                    padding-left: 0 !important;
                    padding-right: 0 !important;
                }

                body.cryptiva-sidebar-collapsed
                .sidebar-logout .sidebar-icon {
                    margin-right: 0 !important;
                }


                /* =================================================
                   COLLAPSE BUTTON
                   ================================================= */

                .sidebar-collapse-button {
                    position: absolute !important;

                    top: 50% !important;
                    right: -17px !important;

                    transform: translateY(-50%) !important;

                    width: 34px !important;
                    height: 34px !important;

                    min-width: 34px !important;
                    min-height: 34px !important;

                    margin: 0 !important;
                    padding: 0 !important;

                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;

                    border: 1px solid rgba(255, 255, 255, 0.14) !important;
                    border-radius: 50% !important;

                    background:
                        linear-gradient(
                            145deg,
                            #17152a 0%,
                            #0e0d1c 100%
                        ) !important;

                    color: rgba(255, 255, 255, 0.78) !important;

                    cursor: pointer !important;

                    z-index: 10000 !important;

                    opacity: 1 !important;
                    visibility: visible !important;

                    box-shadow:
                        0 5px 18px rgba(0, 0, 0, 0.45),
                        0 0 0 1px rgba(91, 64, 190, 0.08);

                    transition:
                        background 0.2s ease,
                        color 0.2s ease,
                        border-color 0.2s ease,
                        box-shadow 0.2s ease,
                        transform 0.2s ease;
                }


                .sidebar-collapse-button:hover {
                 transform: translateY(-50%) scale(1.05) !important;
                    background:
                        linear-gradient(
                            145deg,
                            #211c3d 0%,
                            #131126 100%
                        ) !important;

                    color: #ffffff !important;

                    border-color:
                        rgba(130, 100, 255, 0.35) !important;

                    box-shadow:
                        0 6px 20px rgba(0, 0, 0, 0.5),
                        0 0 16px rgba(92, 61, 220, 0.15);

                    transform: scale(1.05);
                }


                .sidebar-collapse-button:active {
                    transform: translateY(-50%) scale(0.96) !important;
                }


                .sidebar-collapse-button:focus-visible {
                    outline: none !important;

                    border-color:
                        rgba(93, 70, 220, 0.8) !important;

                    box-shadow:
                        0 0 0 3px rgba(93, 70, 220, 0.2);
                }


                .sidebar-collapse-button svg {
                    width: 15px !important;
                    height: 15px !important;

                    flex-shrink: 0;

                    display: block;

                    transition:
                        transform 0.25s ease;
                }


                /* Expanded = arrow points left */

                body:not(.cryptiva-sidebar-collapsed)
                .sidebar-collapse-button svg {
                    transform: rotate(0deg);
                }


                /* Collapsed = arrow points right */

                body.cryptiva-sidebar-collapsed
                .sidebar-collapse-button svg {
                    transform: rotate(180deg);
                }


                /* =================================================
                   COLLAPSED SIDEBAR BUTTON POSITION
                   ================================================= */

                body.cryptiva-sidebar-collapsed
                .sidebar-collapse-button {
                    right: -17px !important;
                }
            }


            /* =====================================================
               MOBILE
               ===================================================== */

            @media (max-width: 900px) {

                body.cryptiva-sidebar-collapsed {
                    padding-left: 0 !important;
                }

                body.cryptiva-sidebar-collapsed
                .cryptiva-sidebar {
                    width: 270px !important;
                    min-width: 270px !important;
                }


                /*
                 * Never apply desktop collapsed styles on mobile.
                 */

                body.cryptiva-sidebar-collapsed
                .sidebar-brand-text,

                body.cryptiva-sidebar-collapsed
                .sidebar-section-label,

                body.cryptiva-sidebar-collapsed
                .sidebar-link-text,

                body.cryptiva-sidebar-collapsed
                .sidebar-user-info {
                    display: initial !important;
                }


                body.cryptiva-sidebar-collapsed
                .sidebar-link {
                    justify-content: flex-start !important;

                    padding-left: 11px !important;
                    padding-right: 11px !important;

                    gap: initial !important;
                }


                body.cryptiva-sidebar-collapsed
                .sidebar-icon {
                    margin-right: 12px !important;
                }


                body.cryptiva-sidebar-collapsed
                .sidebar-user-card {
                    justify-content: flex-start !important;
                    padding: 10px !important;
                }


                body.cryptiva-sidebar-collapsed
                .sidebar-logout {
                    justify-content: flex-start !important;

                    padding-left: 11px !important;
                    padding-right: 11px !important;
                }


                body.cryptiva-sidebar-collapsed
                .sidebar-logout .sidebar-icon {
                    margin-right: 12px !important;
                }


                /* Desktop collapse button hidden on mobile */

                .sidebar-collapse-button {
                    display: none !important;
                }
            }
        `;

        document.head.appendChild(style);
    }


    /* =========================================================
       COLLAPSE ICON
       ========================================================= */

    function getCollapseIcon() {
        return `
            <svg
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    d="M14.5 7L9.5 12L14.5 17"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>
        `;
    }


    /* =========================================================
       CREATE COLLAPSE BUTTON
       ========================================================= */

    function createCollapseButton() {
        if (!sidebar) {
            return;
        }

        const existingButton = document.getElementById(
            'sidebar-collapse-button'
        );

        if (existingButton) {
            collapseButton = existingButton;
            return;
        }

        const button = document.createElement('button');

        button.type = 'button';

        button.id = 'sidebar-collapse-button';

        button.className = 'sidebar-collapse-button';

        button.setAttribute(
            'aria-label',
            'Collapse sidebar'
        );

        button.setAttribute(
            'title',
            'Collapse sidebar'
        );

        button.setAttribute(
            'aria-expanded',
            'true'
        );

        button.innerHTML = getCollapseIcon();

        button.addEventListener(
            'click',
            toggleSidebar
        );

        sidebar.appendChild(button);

        collapseButton = button;
    }


    /* =========================================================
       UPDATE BUTTON STATE
       ========================================================= */

    function updateButtonState(collapsed) {
        if (!collapseButton) {
            collapseButton = document.getElementById(
                'sidebar-collapse-button'
            );
        }

        if (!collapseButton) {
            return;
        }

        const mobile =
            window.innerWidth <= MOBILE_BREAKPOINT;

        if (mobile) {
            collapseButton.style.display = 'none';

            return;
        }

        collapseButton.style.display = 'flex';

        if (collapsed) {
            collapseButton.setAttribute(
                'aria-label',
                'Expand sidebar'
            );

            collapseButton.setAttribute(
                'title',
                'Expand sidebar'
            );

            collapseButton.setAttribute(
                'aria-expanded',
                'false'
            );
        } else {
            collapseButton.setAttribute(
                'aria-label',
                'Collapse sidebar'
            );

            collapseButton.setAttribute(
                'title',
                'Collapse sidebar'
            );

            collapseButton.setAttribute(
                'aria-expanded',
                'true'
            );
        }
    }


    /* =========================================================
       APPLY STATE
       ========================================================= */

    function applyState(collapsed) {
        const isMobile =
            window.innerWidth <= MOBILE_BREAKPOINT;

        if (isMobile) {
            document.body.classList.remove(
                'cryptiva-sidebar-collapsed'
            );

            updateButtonState(false);

            return;
        }

        document.body.classList.toggle(
            'cryptiva-sidebar-collapsed',
            Boolean(collapsed)
        );

        updateButtonState(Boolean(collapsed));
    }


    /* =========================================================
       TOGGLE SIDEBAR
       ========================================================= */

    function toggleSidebar(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        if (window.innerWidth <= MOBILE_BREAKPOINT) {
            return;
        }

        const collapsed =
            document.body.classList.contains(
                'cryptiva-sidebar-collapsed'
            );

        const newState = !collapsed;

        applyState(newState);

        try {
            localStorage.setItem(
                STORAGE_KEY,
                newState ? 'true' : 'false'
            );
        } catch (error) {
            console.warn(
                'Unable to save sidebar state:',
                error
            );
        }
    }


    /* =========================================================
       LOAD SAVED STATE
       ========================================================= */

    function loadSavedState() {
        let collapsed = false;

        try {
            collapsed =
                localStorage.getItem(
                    STORAGE_KEY
                ) === 'true';
        } catch (error) {
            collapsed = false;
        }

        applyState(collapsed);
    }


    /* =========================================================
       HANDLE RESIZE
       ========================================================= */

    function handleResize() {
        const isMobile =
            window.innerWidth <= MOBILE_BREAKPOINT;

        if (isMobile) {
            document.body.classList.remove(
                'cryptiva-sidebar-collapsed'
            );

            updateButtonState(false);

            return;
        }

        let collapsed = false;

        try {
            collapsed =
                localStorage.getItem(
                    STORAGE_KEY
                ) === 'true';
        } catch (error) {
            collapsed = false;
        }

        applyState(collapsed);
    }


    /* =========================================================
       FIND SIDEBAR
       ========================================================= */

    function findSidebar() {
        return document.getElementById(
            'cryptiva-sidebar'
        );
    }


    /* =========================================================
       INITIALIZE
       ========================================================= */

    function init() {
        injectStyles();

        sidebar = findSidebar();

        if (!sidebar) {
            console.error(
                'Cryptiva sidebar not found.'
            );

            return;
        }

        createCollapseButton();

        loadSavedState();
    }


    /* =========================================================
       START
       ========================================================= */

    function start() {
        /*
         * sidebar.js should normally create the sidebar
         * before this script runs.
         *
         * This fallback also handles cases where the sidebar
         * is inserted slightly later.
         */

        if (findSidebar()) {
            init();

            return;
        }

        const observer =
            new MutationObserver(function () {
                if (findSidebar()) {
                    observer.disconnect();

                    init();
                }
            });

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );

        setTimeout(function () {
            observer.disconnect();

            if (!sidebar) {
                const currentSidebar =
                    findSidebar();

                if (currentSidebar) {
                    init();
                }
            }
        }, 5000);
    }


    /* =========================================================
       EVENT LISTENERS
       ========================================================= */

    window.addEventListener(
        'resize',
        handleResize
    );


    /* =========================================================
       DOM READY
       ========================================================= */

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            start,
            { once: true }
        );
    } else {
        start();
    }

})();