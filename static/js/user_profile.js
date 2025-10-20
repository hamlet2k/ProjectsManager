(() => {
    const profileForm = document.getElementById("profile-form");
    const saveButton = document.getElementById("profile-save-button");
    const passwordForm = document.getElementById("password-change-form");
    const passwordSubmitButton = document.getElementById("password-submit-button");
    const passwordModalElement = document.getElementById("password-modal");
    const initialTheme = document.body.getAttribute("data-bs-theme") || "light";

    function toTrimmedValue(field) {
        return (field?.value || "").trim();
    }

    function collectInitialValues(form) {
        const fieldNames = ["profile-username", "profile-name", "profile-email"];
        const store = new Map();
        fieldNames.forEach((name) => {
            const field = form.elements.namedItem(name);
            if (field) {
                store.set(name, toTrimmedValue(field));
            }
        });
        const themeField = form.querySelector('input[name="profile-theme"]:checked');
        store.set("profile-theme", themeField ? themeField.value : "");
        return store;
    }

    function hasProfileChanges(form, initialStore) {
        for (const [name, initialValue] of initialStore.entries()) {
            if (name === "profile-theme") {
                const selected = form.querySelector('input[name="profile-theme"]:checked');
                const current = selected ? selected.value : "";
                if (current !== initialValue) {
                    return true;
                }
                continue;
            }
            const field = form.elements.namedItem(name);
            if (field && toTrimmedValue(field) !== initialValue) {
                return true;
            }
        }
        return false;
    }

    function toggleButtonDisabled(button, shouldDisable) {
        if (!button) {
            return;
        }
        if (shouldDisable) {
            button.setAttribute("disabled", "disabled");
        } else {
            button.removeAttribute("disabled");
        }
    }

    function wireProfileForm() {
        if (!profileForm || !saveButton) {
            return;
        }

        const initialValues = collectInitialValues(profileForm);

        const updateSaveState = () => {
            const isValid = profileForm.checkValidity();
            const dirty = hasProfileChanges(profileForm, initialValues);
            toggleButtonDisabled(saveButton, !(isValid && dirty));
        };

        profileForm.addEventListener("input", updateSaveState);
        profileForm.addEventListener("change", updateSaveState);
        profileForm.addEventListener("submit", (event) => {
            if (!profileForm.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            profileForm.classList.add("was-validated");
            updateSaveState();
        });

        const themeRadios = profileForm.querySelectorAll('input[name="profile-theme"]');
        themeRadios.forEach((radio) => {
            radio.addEventListener("change", () => {
                if (radio.checked) {
                    document.body.setAttribute("data-bs-theme", radio.value);
                    updateSaveState();
                }
            });
        });

        window.addEventListener("beforeunload", () => {
            document.body.setAttribute("data-bs-theme", initialTheme);
        });

        updateSaveState();
    }

    function wirePasswordForm() {
        if (!passwordForm || !passwordSubmitButton) {
            return;
        }

        const updatePasswordButtonState = () => {
            const isValid = passwordForm.checkValidity();
            toggleButtonDisabled(passwordSubmitButton, !isValid);
        };

        passwordForm.addEventListener("input", updatePasswordButtonState);
        passwordForm.addEventListener("change", updatePasswordButtonState);
        passwordForm.addEventListener("submit", (event) => {
            if (!passwordForm.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            passwordForm.classList.add("was-validated");
        });

        if (passwordModalElement) {
            passwordModalElement.addEventListener("shown.bs.modal", () => {
                updatePasswordButtonState();
                const currentField = passwordForm.querySelector('[name="password-current_password"]');
                if (currentField) {
                    currentField.focus();
                }
            });
            passwordModalElement.addEventListener("hidden.bs.modal", () => {
                passwordForm.reset();
                passwordForm.classList.remove("was-validated");
                updatePasswordButtonState();
            });
        }

        updatePasswordButtonState();
    }

    function handlePasswordModalVisibility() {
        if (!passwordModalElement || !window.bootstrap) {
            return;
        }
        const shouldOpen = Boolean(window.__passwordFormHasErrors);
        if (shouldOpen) {
            window.bootstrap.Modal.getOrCreateInstance(passwordModalElement).show();
        }
    }

    wireProfileForm();
    wirePasswordForm();
    handlePasswordModalVisibility();
})();
