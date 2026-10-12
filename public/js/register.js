document.addEventListener(
    'DOMContentLoaded',
    () => {

        /*
        |--------------------------------------------------------------------------
        | Elements
        |--------------------------------------------------------------------------
        */

        const flash =
            document.getElementById('flash');

        const form =
            document.getElementById('reg-form');

        const password =
            document.getElementById('password');

        const confirmPassword =
            document.getElementById('confirmPassword');

        const passwordHint =
            document.getElementById('password-hint');

        const matchHint =
            document.getElementById('match-hint');

        const submitButton =
            document.querySelector('.btn-register');


        /*
        |--------------------------------------------------------------------------
        | Flash Messages
        |--------------------------------------------------------------------------
        */

        const error =
            document.body.dataset.error;

        const success =
            document.body.dataset.success;


        if (error) {

            flash.innerHTML =
                `
                <div class="flash error">
                    <span>⚠</span>
                    <span>${error}</span>
                </div>
                `;

        }


        if (success) {

            flash.innerHTML =
                `
                <div class="flash success">
                    <span>✓</span>
                    <span>${success}</span>
                </div>
                `;

        }


        /*
        |--------------------------------------------------------------------------
        | Password Visibility
        |--------------------------------------------------------------------------
        */

        const passwordToggle =
            document.getElementById(
                'toggle-password'
            );

        const confirmToggle =
            document.getElementById(
                'toggle-confirm'
            );


        function setupPasswordToggle(
            input,
            button
        ) {

            if (!input || !button) {
                return;
            }


            button.addEventListener(
                'click',
                (event) => {

                    event.preventDefault();

                    event.stopPropagation();


                    const shouldShow =
                        input.type === 'password';


                    input.type =
                        shouldShow
                            ? 'text'
                            : 'password';


                    button.textContent =
                        shouldShow
                            ? 'Hide'
                            : 'Show';


                    button.setAttribute(
                        'aria-label',
                        shouldShow
                            ? 'Hide password'
                            : 'Show password'
                    );

                }
            );

        }


        setupPasswordToggle(
            password,
            passwordToggle
        );


        setupPasswordToggle(
            confirmPassword,
            confirmToggle
        );


        /*
        |--------------------------------------------------------------------------
        | Password Status
        |--------------------------------------------------------------------------
        */

        function updatePasswordStatus() {

            const value =
                password.value;

            const confirmation =
                confirmPassword.value;


            if (
                value.length >= 6
            ) {

                passwordHint.textContent =
                    '✓ Password length is valid';

                passwordHint.classList.add(
                    'valid'
                );

            } else {

                passwordHint.textContent =
                    'Minimum 6 characters';

                passwordHint.classList.remove(
                    'valid'
                );

            }


            if (
                confirmation.length === 0
            ) {

                matchHint.textContent =
                    'Passwords must match';

                matchHint.classList.remove(
                    'valid'
                );

            } else if (
                value === confirmation
            ) {

                matchHint.textContent =
                    '✓ Passwords match';

                matchHint.classList.add(
                    'valid'
                );

            } else {

                matchHint.textContent =
                    'Passwords do not match';

                matchHint.classList.remove(
                    'valid'
                );

            }

        }


        password.addEventListener(
            'input',
            updatePasswordStatus
        );


        confirmPassword.addEventListener(
            'input',
            updatePasswordStatus
        );


        /*
        |--------------------------------------------------------------------------
        | Registration Validation
        |--------------------------------------------------------------------------
        */

        form.addEventListener(
            'submit',
            (event) => {

                const pw =
                    password.value;

                const cpw =
                    confirmPassword.value;


                if (
                    pw.length < 6
                ) {

                    event.preventDefault();


                    flash.innerHTML =
                        `
                        <div class="flash error">
                            <span>⚠</span>
                            <span>
                                Password must contain at least
                                6 characters.
                            </span>
                        </div>
                        `;

                    return;
                }


                if (
                    pw !== cpw
                ) {

                    event.preventDefault();


                    flash.innerHTML =
                        `
                        <div class="flash error">
                            <span>⚠</span>
                            <span>
                                Passwords do not match.
                            </span>
                        </div>
                        `;

                    return;
                }


                /*
                |--------------------------------------------------------------------------
                | Prevent Double Submission
                |--------------------------------------------------------------------------
                */

                submitButton.disabled =
                    true;

                submitButton.textContent =
                    'Creating account…';

                submitButton.style.opacity =
                    '0.75';

                submitButton.style.cursor =
                    'wait';

            }
        );

    }
);