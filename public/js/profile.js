'use strict';


(() => {

    /*
    |--------------------------------------------------------------------------
    | DOM Elements
    |--------------------------------------------------------------------------
    */

    const elements = {

        username:
            document.getElementById(
                'username'
            ),

        usernameCard:
            document.getElementById(
                'profile-username-card'
            ),

        status:
            document.getElementById(
                'profile-status'
            ),

        detailStatus:
            document.getElementById(
                'profile-detail-status'
            ),

        created:
            document.getElementById(
                'profile-created'
            ),

        detailCreated:
            document.getElementById(
                'profile-detail-created'
            ),

        detailUpdated:
            document.getElementById(
                'profile-detail-updated'
            ),

        form:
            document.getElementById(
                'profile-form'
            ),

        saveButton:
            document.getElementById(
                'save-profile-button'
            ),

        toastRegion:
            document.getElementById(
                'profile-toast-region'
            )

    };


    /*
    |--------------------------------------------------------------------------
    | Toast
    |--------------------------------------------------------------------------
    */

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
            `profile-toast ${type}`;


        toast.textContent =
            message;


        elements.toastRegion.appendChild(
            toast
        );


        setTimeout(
            () => {

                toast.classList.add(
                    'hide'
                );


                setTimeout(
                    () => toast.remove(),
                    250
                );

            },
            3000
        );

    }


    /*
    |--------------------------------------------------------------------------
    | Format Date
    |--------------------------------------------------------------------------
    */

    function formatDate(
        value
    ) {

        if (!value) {
            return '—';
        }


        const date =
            new Date(value);


        if (
            Number.isNaN(
                date.getTime()
            )
        ) {
            return '—';
        }


        return new Intl.DateTimeFormat(
            'en-MY',
            {
                day:
                    '2-digit',

                month:
                    'short',

                year:
                    'numeric'
            }
        ).format(date);

    }


    /*
    |--------------------------------------------------------------------------
    | Apply Profile Data
    |--------------------------------------------------------------------------
    */

    function applyProfileData(
        data
    ) {

        /*
        |--------------------------------------------------------------------------
        | Username
        |--------------------------------------------------------------------------
        */

        if (
            elements.username
        ) {

            elements.username.value =
                data.username || '';

        }


        if (
            elements.usernameCard
        ) {

            elements.usernameCard.textContent =
                data.username || '—';

        }


        /*
        |--------------------------------------------------------------------------
        | Status
        |--------------------------------------------------------------------------
        */

        const status =
            data.status || 'active';


        const displayStatus =
            status
                .charAt(0)
                .toUpperCase() +
            status.slice(1);


        if (
            elements.status
        ) {

            elements.status.textContent =
                displayStatus;

        }


        if (
            elements.detailStatus
        ) {

            elements.detailStatus.textContent =
                displayStatus;

        }


        /*
        |--------------------------------------------------------------------------
        | Created date
        |--------------------------------------------------------------------------
        */

        const createdDate =
            formatDate(
                data.createdAt
            );


        if (
            elements.created
        ) {

            elements.created.textContent =
                createdDate;

        }


        if (
            elements.detailCreated
        ) {

            elements.detailCreated.textContent =
                createdDate;

        }


        /*
        |--------------------------------------------------------------------------
        | Updated date
        |--------------------------------------------------------------------------
        */

        if (
            elements.detailUpdated
        ) {

            elements.detailUpdated.textContent =
                formatDate(
                    data.updatedAt
                );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Refresh Profile Data
    |--------------------------------------------------------------------------
    |
    | This is NOT used during initial page loading.
    |
    | Initial profile data comes directly from the server-rendered HTML.
    |
    | This function is only used after saving a profile change.
    |
    |--------------------------------------------------------------------------
    */

    async function loadProfile() {

        try {

            const response =
                await fetch(
                    '/profile/data',
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
                await response.json();


            if (
                !response.ok
            ) {

                throw new Error(
                    data.error ||
                    'Unable to load profile.'
                );

            }


            applyProfileData(
                data
            );


        } catch (error) {

            console.error(
                '[PROFILE] Refresh failed:',
                error
            );


            showToast(
                error.message ||
                'Unable to refresh profile information.',
                'error'
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Save Profile
    |--------------------------------------------------------------------------
    */

    async function saveProfile(
        event
    ) {

        event.preventDefault();


        const username =
            elements.username
                ? elements.username.value.trim()
                : '';


        /*
        |--------------------------------------------------------------------------
        | Required
        |--------------------------------------------------------------------------
        */

        if (!username) {

            showToast(
                'Username is required.',
                'error'
            );

            return;

        }


        /*
        |--------------------------------------------------------------------------
        | Length
        |--------------------------------------------------------------------------
        */

        if (
            username.length < 3 ||
            username.length > 20
        ) {

            showToast(
                'Username must be between 3 and 20 characters.',
                'error'
            );

            return;

        }


        /*
        |--------------------------------------------------------------------------
        | Characters
        |--------------------------------------------------------------------------
        */

        if (
            !/^[a-zA-Z0-9_]+$/.test(
                username
            )
        ) {

            showToast(
                'Username may only contain letters, numbers, and underscores.',
                'error'
            );

            return;

        }


        /*
        |--------------------------------------------------------------------------
        | CSRF
        |--------------------------------------------------------------------------
        */

        const csrfMeta =
            document.querySelector(
                'meta[name="csrf-token"]'
            );


        const csrfToken =
            csrfMeta
                ? csrfMeta.content
                : '';


        /*
        |--------------------------------------------------------------------------
        | Button state
        |--------------------------------------------------------------------------
        */

        if (
            elements.saveButton
        ) {

            elements.saveButton.disabled =
                true;


            const buttonText =
                elements.saveButton.querySelector(
                    'span'
                );


            if (buttonText) {

                buttonText.textContent =
                    'Saving...';

            }

        }


        try {

            const response =
                await fetch(
                    '/profile/update',
                    {
                        method:
                            'POST',

                        credentials:
                            'same-origin',

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
                                username
                            })

                    }
                );


            const data =
                await response.json();


            if (
                !response.ok
            ) {

                throw new Error(
                    data.error ||
                    'Unable to update profile.'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Update immediately
            |--------------------------------------------------------------------------
            */

            applyProfileData({

                username:
                    data.username,

                status:
                    elements.status
                        ? elements.status.textContent
                            .toLowerCase()
                        : 'active',

                createdAt:
                    elements.created
                        ? elements.created.textContent
                        : null,

                updatedAt:
                    new Date()

            });


            /*
            |--------------------------------------------------------------------------
            | Success message
            |--------------------------------------------------------------------------
            */

            showToast(
                data.message ||
                'Profile updated successfully.',
                'success'
            );


            /*
            |--------------------------------------------------------------------------
            | Reload latest MongoDB values
            |--------------------------------------------------------------------------
            */

            await loadProfile();


        } catch (error) {

            console.error(
                '[PROFILE] Update failed:',
                error
            );


            showToast(
                error.message ||
                'Unable to update profile.',
                'error'
            );

        } finally {

            if (
                elements.saveButton
            ) {

                elements.saveButton.disabled =
                    false;


                const buttonText =
                    elements.saveButton.querySelector(
                        'span'
                    );


                if (buttonText) {

                    buttonText.textContent =
                        'Save Changes';

                }

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Initialize
    |--------------------------------------------------------------------------
    */

    function init() {

        console.log(
            '[PROFILE] Profile JavaScript loaded.'
        );


        /*
        |--------------------------------------------------------------------------
        | Save handler
        |--------------------------------------------------------------------------
        */

        if (
            elements.form
        ) {

            elements.form.addEventListener(
                'submit',
                saveProfile
            );

        }


        /*
        |--------------------------------------------------------------------------
        | IMPORTANT
        |--------------------------------------------------------------------------
        |
        | Do NOT call loadProfile() here.
        |
        | The server has already loaded the profile from MongoDB and rendered
        | the values directly into profile.html before sending it to the browser.
        |
        |--------------------------------------------------------------------------
        */

    }


    /*
    |--------------------------------------------------------------------------
    | DOM Ready
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