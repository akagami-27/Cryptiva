(function () {

    'use strict';


    let selectedFileId = null;


    let selectedFile = null;


    /*
    |--------------------------------------------------------------------------
    | Helpers
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
                `Request failed with status ${response.status}`
        };

    }


    /*
    |--------------------------------------------------------------------------
    | Dropdown
    |--------------------------------------------------------------------------
    */

    function closeAllDropdowns() {

        document
            .querySelectorAll(
                '.custom-select.open'
            )
            .forEach(
                control => {

                    control.classList.remove(
                        'open'
                    );


                    const trigger =
                        control.querySelector(
                            '.custom-select-trigger'
                        );


                    if (trigger) {

                        trigger.setAttribute(
                            'aria-expanded',
                            'false'
                        );

                    }

                }
            );

    }


    function updateDropdown(
        control,
        option
    ) {

        if (
            !control ||
            !option
        ) {

            return;

        }


        const target =
            document.getElementById(
                control.dataset.target
            );


        const value =
            control.querySelector(
                '.custom-select-value'
            );


        const options =
            control.querySelectorAll(
                '.custom-select-option'
            );


        if (!target || !value) {

            return;

        }


        target.value =
            option.dataset.value;


        value.textContent =
            option.textContent.trim();


        options.forEach(
            item => {

                const selected =
                    item === option;


                item.classList.toggle(
                    'selected',
                    selected
                );


                item.setAttribute(
                    'aria-selected',
                    selected
                        ? 'true'
                        : 'false'
                );

            }
        );


        updatePreview(
            target.id,
            target.value
        );

    }


    function updatePreview(
        targetId,
        value
    ) {

        if (
            targetId ===
            'share-expiry'
        ) {

            const preview =
                document.getElementById(
                    'share-expiry-preview'
                );


            if (!preview) {
                return;
            }


            const text =
                preview.querySelector(
                    'span'
                );


            const hours =
                Number(value);


            if (
                !Number.isFinite(
                    hours
                )
            ) {

                return;

            }


            const expiresAt =
                new Date(
                    Date.now() +
                    hours *
                    60 *
                    60 *
                    1000
                );


            text.textContent =
                `Expires ${expiresAt.toLocaleString(
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
                )}`;

        }


        if (
            targetId ===
            'share-limit'
        ) {

            const preview =
                document.getElementById(
                    'share-limit-preview'
                );


            if (!preview) {
                return;
            }


            const text =
                preview.querySelector(
                    'span'
                );


            const number =
                Number(value);


            text.textContent =
                `Link can be downloaded ${number} ${
                    number === 1
                        ? 'time'
                        : 'times'
                }`;

        }

    }


    function syncDropdowns() {

        document
            .querySelectorAll(
                '.custom-select'
            )
            .forEach(
                control => {

                    const target =
                        document.getElementById(
                            control.dataset.target
                        );


                    const option =
                        control.querySelector(
                            `.custom-select-option[data-value="${CSS.escape(
                                target?.value || ''
                            )}"]`
                        );


                    if (option) {

                        updateDropdown(
                            control,
                            option
                        );

                    }

                }
            );

    }


    /*
    |--------------------------------------------------------------------------
    | Open Share Modal
    |--------------------------------------------------------------------------
    */

    async function openShareModal(
        fileId
    ) {

        try {

            const response =
                await fetch(
                    '/dashboard/data',
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
                await parseResponse(
                    response
                );


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    'Unable to load file information.'
                );

            }


            const files =
                Array.isArray(
                    data.files
                )
                    ? data.files
                    : [];


            selectedFile =
                files.find(
                    file =>
                        String(
                            file.id
                        ) ===
                        String(
                            fileId
                        )
                );


            if (!selectedFile) {

                throw new Error(
                    'File not found.'
                );

            }


            selectedFileId =
                String(
                    fileId
                );


            const modal =
                document.getElementById(
                    'share-modal'
                );


            if (!modal) {

                throw new Error(
                    'Share modal not found.'
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Filename
            |--------------------------------------------------------------------------
            */

            const filename =
                document.getElementById(
                    'share-filename'
                );


            if (filename) {

                filename.textContent =
                    selectedFile.originalName ||
                    'Selected file';

            }


            /*
            |--------------------------------------------------------------------------
            | Reset Password
            |--------------------------------------------------------------------------
            */

            const password =
                document.getElementById(
                    'share-password'
                );


            if (password) {

                password.value =
                    '';

            }


            /*
            |--------------------------------------------------------------------------
            | Existing Expiry
            |--------------------------------------------------------------------------
            */

            let expiryHours =
                24;


            if (
                selectedFile.expiresAt
            ) {

                const difference =
                    new Date(
                        selectedFile.expiresAt
                    ).getTime() -
                    Date.now();


                const calculatedHours =
                    Math.ceil(
                        difference /
                        (
                            1000 *
                            60 *
                            60
                        )
                    );


                const allowed =
                    [
                        1,
                        6,
                        24,
                        72,
                        168,
                        720
                    ];


                if (
                    allowed.includes(
                        calculatedHours
                    )
                ) {

                    expiryHours =
                        calculatedHours;

                } else {

                    /*
                    | Existing share may have a few minutes
                    | remaining. Use the closest option.
                    */

                    expiryHours =
                        allowed.reduce(
                            (
                                previous,
                                current
                            ) =>
                                Math.abs(
                                    current -
                                    calculatedHours
                                ) <
                                Math.abs(
                                    previous -
                                    calculatedHours
                                )
                                    ? current
                                    : previous
                        );

                }

            }


            const expiryInput =
                document.getElementById(
                    'share-expiry'
                );


            if (expiryInput) {

                expiryInput.value =
                    String(
                        expiryHours
                    );

            }


            /*
            |--------------------------------------------------------------------------
            | Existing Download Limit
            |--------------------------------------------------------------------------
            */

            let downloadLimit =
                Number(
                    selectedFile.maxDownloads
                );


            const allowedLimits =
                [
                    1,
                    5,
                    10,
                    25,
                    50,
                    100
                ];


            if (
                !allowedLimits.includes(
                    downloadLimit
                )
            ) {

                downloadLimit =
                    1;

            }


            const limitInput =
                document.getElementById(
                    'share-limit'
                );


            if (limitInput) {

                limitInput.value =
                    String(
                        downloadLimit
                    );

            }


            /*
            |--------------------------------------------------------------------------
            | Update Visible Controls
            |--------------------------------------------------------------------------
            */

            syncDropdowns();


            /*
            |--------------------------------------------------------------------------
            | Open
            |--------------------------------------------------------------------------
            */

            modal.classList.remove(
                'hidden'
            );


            document.body.classList.add(
                'modal-open'
            );


            /*
            |--------------------------------------------------------------------------
            | Focus Password
            |--------------------------------------------------------------------------
            */

            if (password) {

                setTimeout(
                    () => {

                        password.focus();

                    },
                    50
                );

            }

        } catch (error) {

            console.error(
                'Share modal error:',
                error
            );


            alert(
                error.message ||
                'Unable to open share settings.'
            );

        }

    }


    /*
    |--------------------------------------------------------------------------
    | Submit Share
    |--------------------------------------------------------------------------
    */

    async function submitShare(
        event
    ) {

        event.preventDefault();


        event.stopImmediatePropagation();


        if (!selectedFileId) {

            return;

        }


        const passwordInput =
            document.getElementById(
                'share-password'
            );


        const expiryInput =
            document.getElementById(
                'share-expiry'
            );


        const limitInput =
            document.getElementById(
                'share-limit'
            );


        const submitButton =
            document.getElementById(
                'share-submit'
            );


        const password =
            passwordInput
                ? passwordInput.value
                : '';


        const expiresInHours =
            expiryInput
                ? Number(
                    expiryInput.value
                )
                : 24;


        const maxDownloads =
            limitInput
                ? Number(
                    limitInput.value
                )
                : 1;


        if (
            password.length < 8 ||
            password.length > 128
        ) {

            alert(
                'Share password must be between 8 and 128 characters.'
            );

            return;

        }


        if (submitButton) {

            submitButton.disabled =
                true;

            submitButton.textContent =
                'Saving secure link...';

        }


        try {

            const response =
                await fetch(
                    `/files/share/${encodeURIComponent(
                        selectedFileId
                    )}`,
                    {

                        method:
                            'POST',

                        headers: {

                            'Content-Type':
                                'application/json',

                            Accept:
                                'application/json',

                            'X-CSRF-Token':
                                getCsrfToken()

                        },

                        credentials:
                            'same-origin',

                        cache:
                            'no-store',

                        body:
                            JSON.stringify({

                                password,

                                expiresInHours,

                                maxDownloads

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
                    'Unable to save share settings.'
                );

            }


            const rawUrl =
                data.shareUrl ||
                data.share?.shareUrl ||
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


            /*
            |--------------------------------------------------------------------------
            | Close Modal
            |--------------------------------------------------------------------------
            */

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


            /*
            |--------------------------------------------------------------------------
            | Copy Link
            |--------------------------------------------------------------------------
            */

            try {

                await navigator.clipboard.writeText(
                    shareUrl
                );

                alert(
                    data.updated
                        ? 'Share settings updated. The existing link was copied.'
                        : 'Secure share link created and copied.'
                );

            } catch {

                window.prompt(
                    'Your secure share link:',
                    shareUrl
                );

            }


            /*
            |--------------------------------------------------------------------------
            | Refresh
            |--------------------------------------------------------------------------
            */

            window.location.reload();

        } catch (error) {

            console.error(
                'Share submit error:',
                error
            );


            alert(
                error.message ||
                'Unable to save share settings.'
            );

        } finally {

            if (submitButton) {

                submitButton.disabled =
                    false;

                submitButton.textContent =
                    'Generate secure link';

            }

        }

    }


    /*
    |--------------------------------------------------------------------------
    | CAPTURE CLICK HANDLER
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        'click',
        function (event) {

            /*
            |--------------------------------------------------------------------------
            | Share button
            |--------------------------------------------------------------------------
            */

            const shareButton =
                event.target.closest(
                    '[data-action="share"]'
                );


            if (shareButton) {

                const id =
                    shareButton.dataset.id;


                if (id) {

                    event.preventDefault();

                    event.stopImmediatePropagation();


                    openShareModal(
                        id
                    );

                    return;

                }

            }


            /*
            |--------------------------------------------------------------------------
            | Dropdown trigger
            |--------------------------------------------------------------------------
            */

            const trigger =
                event.target.closest(
                    '.custom-select-trigger'
                );


            if (trigger) {

                const control =
                    trigger.closest(
                        '.custom-select'
                    );


                if (!control) {
                    return;
                }


                event.preventDefault();

                event.stopImmediatePropagation();


                const wasOpen =
                    control.classList.contains(
                        'open'
                    );


                closeAllDropdowns();


                if (!wasOpen) {

                    control.classList.add(
                        'open'
                    );


                    trigger.setAttribute(
                        'aria-expanded',
                        'true'
                    );

                }


                return;

            }


            /*
            |--------------------------------------------------------------------------
            | Dropdown option
            |--------------------------------------------------------------------------
            */

            const option =
                event.target.closest(
                    '.custom-select-option'
                );


            if (option) {

                const control =
                    option.closest(
                        '.custom-select'
                    );


                if (!control) {
                    return;
                }


                event.preventDefault();

                event.stopImmediatePropagation();


                updateDropdown(
                    control,
                    option
                );


                closeAllDropdowns();


                return;

            }


            /*
            |--------------------------------------------------------------------------
            | Outside click
            |--------------------------------------------------------------------------
            */

            if (
                !event.target.closest(
                    '.custom-select'
                )
            ) {

                closeAllDropdowns();

            }

        },
        true
    );


    /*
    |--------------------------------------------------------------------------
    | CAPTURE FORM SUBMIT
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        'submit',
        function (event) {

            if (
                event.target &&
                event.target.id ===
                    'share-form'
            ) {

                submitShare(
                    event
                );

            }

        },
        true
    );


    /*
    |--------------------------------------------------------------------------
    | Initialise
    |--------------------------------------------------------------------------
    */

    document.addEventListener(
        'DOMContentLoaded',
        function () {

            syncDropdowns();

        }
    );

})();