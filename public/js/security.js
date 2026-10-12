/* =========================================================
   CRYPTIVA SECURITY PAGE
   ========================================================= */

(() => {

    'use strict';


    const state = {

        loading:
            false,

        changingPassword:
            false

    };


    const elements = {

        username:
            document.getElementById(
                'security-username'
            ),

        status:
            document.getElementById(
                'security-status'
            ),

        form:
            document.getElementById(
                'change-password-form'
            ),

        currentPassword:
            document.getElementById(
                'current-password'
            ),

        newPassword:
            document.getElementById(
                'new-password'
            ),

        confirmPassword:
            document.getElementById(
                'confirm-password'
            ),

        passwordStrength:
            document.getElementById(
                'password-strength'
            ),

        strengthLabel:
            document.getElementById(
                'strength-label'
            ),

        passwordMatch:
            document.getElementById(
                'password-match'
            ),

        changeButton:
            document.getElementById(
                'change-password-button'
            ),

        activityList:
            document.getElementById(
                'security-activity-list'
            ),

        toastRegion:
            document.getElementById(
                'security-toast-region'
            )

    };


    /* =========================================================
       CSRF
       ========================================================= */

    function getCsrfToken() {

        const meta =
            document.querySelector(
                'meta[name="csrf-token"]'
            );

        if (
            meta &&
            meta.content
        ) {

            return meta.content;

        }


        const input =
            document.querySelector(
                'input[name="_csrf"]'
            );

        if (
            input &&
            input.value
        ) {

            return input.value;

        }


        return '';

    }


    /* =========================================================
       ESCAPE HTML
       ========================================================= */

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


    /* =========================================================
       RESPONSE PARSER
       ========================================================= */

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


    /* =========================================================
       TOAST
       ========================================================= */

    function showToast(
        message,
        type = 'success'
    ) {

        if (
            !elements.toastRegion
        ) {

            return;

        }


        const toast =
            document.createElement(
                'div'
            );

        toast.className =
            `security-toast ${type}`;


        toast.textContent =
            message;


        elements.toastRegion.appendChild(
            toast
        );


        window.setTimeout(
            () => {

                toast.classList.add(
                    'hide'
                );


                window.setTimeout(
                    () => {

                        toast.remove();

                    },
                    220
                );

            },
            3200
        );

    }


    /* =========================================================
       PASSWORD STRENGTH
       ========================================================= */

    function getStrength(
        password
    ) {

        const value =
            String(
                password || ''
            );


        let score = 0;


        if (
            value.length >= 8
        ) {

            score++;

        }


        if (
            value.length >= 12
        ) {

            score++;

        }


        if (
            /[a-z]/.test(value)
        ) {

            score++;

        }


        if (
            /[A-Z]/.test(value)
        ) {

            score++;

        }


        if (
            /[0-9]/.test(value)
        ) {

            score++;

        }


        if (
            /[^A-Za-z0-9]/.test(value)
        ) {

            score++;

        }


        if (!value) {

            return {
                level:
                    'empty',

                filled:
                    0,

                label:
                    'Enter a password'
            };

        }


        if (
            score <= 2
        ) {

            return {
                level:
                    'weak',

                filled:
                    1,

                label:
                    'Weak password'
            };

        }


        if (
            score <= 4
        ) {

            return {
                level:
                    'medium',

                filled:
                    3,

                label:
                    'Medium password'
            };

        }


        return {
            level:
                'strong',

            filled:
                4,

            label:
                'Strong password'
        };

    }


    function updatePasswordStrength() {

        const password =
            elements.newPassword
                ? elements.newPassword.value
                : '';


        const result =
            getStrength(
                password
            );


        if (
            !elements.passwordStrength
        ) {

            return;

        }


        elements.passwordStrength.dataset.level =
            result.level;


        const bars =
            elements.passwordStrength.querySelectorAll(
                '.strength-bars span'
            );


        bars.forEach(
            (
                bar,
                index
            ) => {

                bar.classList.toggle(
                    'filled',
                    index <
                    result.filled
                );

            }
        );


        if (
            elements.strengthLabel
        ) {

            elements.strengthLabel.textContent =
                result.label;

        }


        updateRequirements(
            password
        );

    }


    /* =========================================================
       REQUIREMENTS
       ========================================================= */

    function updateRequirements(
        password
    ) {

        const rules = {

            length:
                password.length >= 8 &&
                password.length <= 128,

            lowercase:
                /[a-z]/.test(
                    password
                ),

            uppercase:
                /[A-Z]/.test(
                    password
                ),

            number:
                /[0-9]/.test(
                    password
                )

        };


        Object.entries(
            rules
        ).forEach(
            (
                [
                    rule,
                    valid
                ]
            ) => {

                const element =
                    document.querySelector(
                        `[data-rule="${rule}"]`
                    );


                if (!element) {

                    return;

                }


                element.classList.toggle(
                    'valid',
                    valid
                );

            }
        );

    }


    /* =========================================================
       PASSWORD MATCH
       ========================================================= */

    function updatePasswordMatch() {

        if (
            !elements.confirmPassword ||
            !elements.passwordMatch
        ) {

            return;

        }


        const password =
            elements.newPassword
                ? elements.newPassword.value
                : '';


        const confirmation =
            elements.confirmPassword.value;


        elements.passwordMatch.className =
            'password-match';


        if (!confirmation) {

            elements.passwordMatch.textContent =
                '';

            return;

        }


        if (
            password ===
            confirmation
        ) {

            elements.passwordMatch.classList.add(
                'valid'
            );

            elements.passwordMatch.textContent =
                'Passwords match.';

        } else {

            elements.passwordMatch.classList.add(
                'invalid'
            );

            elements.passwordMatch.textContent =
                'Passwords do not match.';

        }

    }


    /* =========================================================
       PASSWORD VISIBILITY
       ========================================================= */

    function bindPasswordToggles() {

        const buttons =
            document.querySelectorAll(
                '.password-toggle'
            );


        buttons.forEach(
            button => {

                button.addEventListener(
                    'click',
                    () => {

                        const targetId =
                            button.dataset.target;


                        const input =
                            document.getElementById(
                                targetId
                            );


                        if (!input) {

                            return;

                        }


                        const showing =
                            input.type ===
                            'text';


                        input.type =
                            showing
                                ? 'password'
                                : 'text';


                        button.setAttribute(
                            'aria-label',
                            showing
                                ? 'Show password'
                                : 'Hide password'
                        );

                    }
                );

            }
        );

    }


    /* =========================================================
       LOAD SECURITY DATA
       ========================================================= */

    async function loadSecurityData() {

        if (
            state.loading
        ) {

            return;

        }


        state.loading =
            true;


        try {

            const response =
                await fetch(
                    '/security/data',
                    {

                        method:
                            'GET',

                        credentials:
                            'same-origin',

                        cache:
                            'no-store',

                        headers: {

                            Accept:
                                'application/json'

                        }

                    }
                );


            const data =
                await parseResponse(
                    response
                );


            if (
                !response.ok
            ) {

                throw new Error(
                    data.error ||
                    'Unable to load security information.'
                );

            }


            renderSecurityData(
                data
            );

        } catch (error) {

            console.error(
                'Security page error:',
                error
            );


            if (
                elements.activityList
            ) {

                elements.activityList.innerHTML = `

                    <div class="security-empty">

                        <div class="security-empty-icon">

                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.8"
                            >

                                <circle
                                    cx="12"
                                    cy="12"
                                    r="9"
                                ></circle>

                                <path
                                    d="M12 8v4"
                                ></path>

                                <circle
                                    cx="12"
                                    cy="16"
                                    r=".6"
                                    fill="currentColor"
                                ></circle>

                            </svg>

                        </div>

                        <strong>
                            Unable to load security activity
                        </strong>

                        <span>
                            ${escapeHtml(
                                error.message ||
                                'Please refresh the page.'
                            )}
                        </span>

                    </div>

                `;

            }

        } finally {

            state.loading =
                false;

        }

    }


    /* =========================================================
       RENDER SECURITY DATA
       ========================================================= */

    function renderSecurityData(
        data
    ) {

        if (
            elements.username
        ) {

            elements.username.textContent =
                data.username ||
                'User';

        }


        if (
            elements.status
        ) {

            const status =
                String(
                    data.accountStatus ||
                    'active'
                );


            elements.status.textContent =
                status
                    .charAt(0)
                    .toUpperCase() +
                status.slice(1);

        }


        renderSecurityActivity(
            Array.isArray(
                data.recentSecurityActivity
            )
                ? data.recentSecurityActivity
                : []
        );

    }


    /* =========================================================
       FORMAT TIME
       ========================================================= */

    function formatTime(
        value
    ) {

        if (!value) {

            return 'Unknown time';

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

            return 'Unknown time';

        }


        return new Intl.DateTimeFormat(
            undefined,
            {
                day:
                    'numeric',

                month:
                    'short',

                year:
                    'numeric',

                hour:
                    'numeric',

                minute:
                    '2-digit'
            }
        ).format(
            date
        );

    }


    function formatRelativeTime(
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
            days < 30
        ) {

            return `${days}d ago`;

        }


        return formatTime(
            value
        );

    }


    /* =========================================================
       ACTIVITY ICON
       ========================================================= */

    function getActivityIcon(
        action
    ) {

        const icons = {

            login_success: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M10 17l5-5-5-5"></path>
                    <path d="M15 12H3"></path>
                    <path d="M14 5V4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-1"></path>
                </svg>
            `,

            login_failed: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="m9 9 6 6"></path>
                    <path d="m15 9-6 6"></path>
                </svg>
            `,

            logout: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M10 17l5-5-5-5"></path>
                    <path d="M15 12H3"></path>
                    <path d="M14 5V4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2v-1"></path>
                </svg>
            `,

            password_changed: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <rect x="4" y="10" width="16" height="11" rx="2"></rect>
                    <path d="M8 10V7a4 4 0 0 1 8 0v3"></path>
                    <path d="m9 15 2 2 4-4"></path>
                </svg>
            `,

            security_event: `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                    <path d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3z"></path>
                    <path d="M12 8v4"></path>
                    <circle cx="12" cy="16" r=".6" fill="currentColor"></circle>
                </svg>
            `

        };


        return (
            icons[action] ||
            icons.security_event
        );

    }


    /* =========================================================
       ACTIVITY TITLE
       ========================================================= */

    function getActivityTitle(
        action
    ) {

        const titles = {

            login_success:
                'Login successful',

            login_failed:
                'Login failed',

            logout:
                'Logout',

            password_changed:
                'Password changed',

            security_event:
                'Security event'

        };


        return (
            titles[action] ||
            'Security activity'
        );

    }


    /* =========================================================
       ACTIVITY CLASS
       ========================================================= */

    function getActivityClass(
        status
    ) {

        if (
            status ===
            'success'
        ) {

            return 'success';

        }


        if (
            status ===
            'failed'
        ) {

            return 'failed';

        }


        if (
            status ===
            'blocked'
        ) {

            return 'blocked';

        }


        if (
            status ===
            'denied'
        ) {

            return 'denied';

        }


        return 'info';

    }


    /* =========================================================
       RENDER SECURITY ACTIVITY
       ========================================================= */

    function renderSecurityActivity(
        activities
    ) {

        if (
            !elements.activityList
        ) {

            return;

        }


        if (
            activities.length === 0
        ) {

            elements.activityList.innerHTML = `

                <div class="security-empty">

                    <div class="security-empty-icon">

                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                        >

                            <path
                                d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3z"
                            ></path>

                            <path
                                d="M8.5 12.2 11 14.5l4.5-5"
                            ></path>

                        </svg>

                    </div>

                    <strong>
                        No recent security activity
                    </strong>

                    <span>
                        Security events will appear here when they occur.
                    </span>

                </div>

            `;

            return;

        }


        elements.activityList.innerHTML =
            activities.map(
                activity => {

                    const statusClass =
                        getActivityClass(
                            activity.status
                        );


                    return `

                        <article class="security-activity-row">

                            <div
                                class="security-activity-icon ${statusClass}"
                            >

                                ${getActivityIcon(
                                    activity.action
                                )}

                            </div>


                            <div class="security-activity-main">

                                <strong>
                                    ${escapeHtml(
                                        getActivityTitle(
                                            activity.action
                                        )
                                    )}
                                </strong>


                                <span>
                                    ${escapeHtml(
                                        activity.description ||
                                        'Security activity recorded.'
                                    )}
                                </span>

                            </div>


                            <div class="security-activity-meta">

                                <span
                                    class="security-activity-status ${statusClass}"
                                >
                                    ${escapeHtml(
                                        activity.status ||
                                        'info'
                                    )}
                                </span>


                                <time
                                    title="${escapeHtml(
                                        formatTime(
                                            activity.createdAt
                                        )
                                    )}"
                                >
                                    ${escapeHtml(
                                        formatRelativeTime(
                                            activity.createdAt
                                        )
                                    )}
                                </time>

                            </div>

                        </article>

                    `;

                }
            ).join('');

    }


    /* =========================================================
       CHANGE PASSWORD
       ========================================================= */

    async function changePassword(
        event
    ) {

        event.preventDefault();


        if (
            state.changingPassword
        ) {

            return;

        }


        const currentPassword =
            elements.currentPassword.value;


        const newPassword =
            elements.newPassword.value;


        const confirmPassword =
            elements.confirmPassword.value;


        if (
            !currentPassword ||
            !newPassword ||
            !confirmPassword
        ) {

            showToast(
                'Please complete all password fields.',
                'error'
            );

            return;

        }


        if (
            newPassword !==
            confirmPassword
        ) {

            showToast(
                'New passwords do not match.',
                'error'
            );

            return;

        }


        if (
            newPassword.length < 8 ||
            newPassword.length > 128
        ) {

            showToast(
                'Password must be between 8 and 128 characters.',
                'error'
            );

            return;

        }


        if (
            !/[a-z]/.test(
                newPassword
            ) ||
            !/[A-Z]/.test(
                newPassword
            ) ||
            !/[0-9]/.test(
                newPassword
            )
        ) {

            showToast(
                'Password must contain uppercase, lowercase, and a number.',
                'error'
            );

            return;

        }


        if (
            currentPassword ===
            newPassword
        ) {

            showToast(
                'New password must be different from your current password.',
                'error'
            );

            return;

        }


        const csrfToken =
            getCsrfToken();


        if (!csrfToken) {

            showToast(
                'Security token unavailable. Refresh the page.',
                'error'
            );

            return;

        }


        state.changingPassword =
            true;


        elements.changeButton.disabled =
            true;


        elements.changeButton.innerHTML = `

            <span class="button-spinner"></span>

            Changing password...

        `;


        try {

            const response =
                await fetch(
                    '/security/change-password',
                    {

                        method:
                            'POST',

                        credentials:
                            'same-origin',

                        cache:
                            'no-store',

                        headers: {

                            'Content-Type':
                                'application/json',

                            Accept:
                                'application/json',

                            'X-CSRF-Token':
                                csrfToken

                        },

                        body:
                            JSON.stringify({

                                currentPassword:
                                    currentPassword,

                                newPassword:
                                    newPassword,

                                confirmPassword:
                                    confirmPassword

                            })

                    }
                );


            const data =
                await parseResponse(
                    response
                );


            if (
                !response.ok
            ) {

                throw new Error(
                    data.error ||
                    'Unable to change password.'
                );

            }


            elements.form.reset();


            updatePasswordStrength();

            updatePasswordMatch();


            showToast(
                'Password changed successfully.',
                'success'
            );


            await loadSecurityData();

        } catch (error) {

            console.error(
                'Password change failed:',
                error
            );


            showToast(
                error.message ||
                'Unable to change password.',
                'error'
            );

        } finally {

            state.changingPassword =
                false;


            elements.changeButton.disabled =
                false;


            elements.changeButton.innerHTML = `

                <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                >

                    <path
                        d="M12 3 5 6v5c0 4.5 2.8 8.2 7 10 4.2-1.8 7-5.5 7-10V6l-7-3z"
                    ></path>

                    <path
                        d="M8.5 12.2 11 14.5l4.5-5"
                    ></path>

                </svg>

                Change Password

            `;

        }

    }


    /* =========================================================
       EVENTS
       ========================================================= */

    function bindEvents() {

        if (
            elements.form
        ) {

            elements.form.addEventListener(
                'submit',
                changePassword
            );

        }


        if (
            elements.newPassword
        ) {

            elements.newPassword.addEventListener(
                'input',
                updatePasswordStrength
            );

        }


        if (
            elements.confirmPassword
        ) {

            elements.confirmPassword.addEventListener(
                'input',
                updatePasswordMatch
            );

        }


        bindPasswordToggles();

    }


    /* =========================================================
       INITIALIZE
       ========================================================= */

    function initialize() {

        bindEvents();

        updatePasswordStrength();

        updatePasswordMatch();

        loadSecurityData();

    }


    if (
        document.readyState ===
        'loading'
    ) {

        document.addEventListener(
            'DOMContentLoaded',
            initialize
        );

    } else {

        initialize();

    }

})();