(function () {
  document.addEventListener("DOMContentLoaded", function () {
    const modalElement = document.getElementById("feedbackModal");
    if (!modalElement) {
      return;
    }

    const form = modalElement.querySelector("#feedbackForm");
    if (!form) {
      return;
    }

    const titleInput = form.querySelector("#feedbackTitle");
    const descriptionInput = form.querySelector("#feedbackBody");
    const typeInputs = Array.from(form.querySelectorAll('input[name="label"]'));
    const typeField = form.querySelector('[data-feedback-type-field]');
    const typeInvalidFeedback = form.querySelector('[data-feedback-type-invalid]');
    const successAlert = form.querySelector("[data-feedback-success]");
    const errorAlert = form.querySelector("[data-feedback-error]");
    const submitButton = form.querySelector("[data-feedback-submit]");
    const submitLabel = form.querySelector("[data-feedback-submit-label]");
    const spinner = form.querySelector("[data-feedback-spinner]");
    const csrfInput = form.querySelector('input[name="csrf_token"]');

    const descriptionState = {
      isExpanded: false,
    };

    const DESCRIPTION_COLLAPSED_LINES = 3;
    const DESCRIPTION_TRANSITION = "height 0.2s ease";

    function getComputedLineHeight(element) {
      if (!element) {
        return 20;
      }
      const computed = window.getComputedStyle(element);
      const lineHeight = parseFloat(computed.lineHeight);
      if (Number.isFinite(lineHeight) && lineHeight > 0) {
        return lineHeight;
      }
      const fontSize = parseFloat(computed.fontSize);
      if (Number.isFinite(fontSize) && fontSize > 0) {
        return fontSize * 1.2;
      }
      return 20;
    }

    function updateTitleHeight() {
      if (!titleInput) {
        return;
      }
      const lineHeight = getComputedLineHeight(titleInput);
      const maxHeight = lineHeight * 2;
      titleInput.style.maxHeight = `${maxHeight}px`;
      titleInput.style.height = "auto";
      const naturalHeight = titleInput.scrollHeight;
      const targetHeight = Math.max(Math.min(naturalHeight, maxHeight), lineHeight);
      titleInput.style.height = `${targetHeight}px`;
      titleInput.style.overflowY = naturalHeight > maxHeight ? "auto" : "hidden";
      const isExpanded = targetHeight > lineHeight + 1;
      titleInput.setAttribute("aria-expanded", isExpanded ? "true" : "false");
    }

    function computeDescriptionMaxHeight() {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const eightyPercent = Math.floor(viewportHeight * 0.8);
      return Math.max(eightyPercent, 240);
    }

    function computeDescriptionCollapsedHeight() {
      if (!descriptionInput) {
        return 0;
      }
      const lineHeight = getComputedLineHeight(descriptionInput);
      const maxHeight = computeDescriptionMaxHeight();
      const collapsedLinesHeight = lineHeight * DESCRIPTION_COLLAPSED_LINES;
      const previousHeight = descriptionInput.style.height;
      descriptionInput.style.height = "auto";
      const naturalHeight = descriptionInput.scrollHeight;
      descriptionInput.style.height = previousHeight;
      const baseHeight = Math.max(collapsedLinesHeight, lineHeight);
      const collapsedHeight = Math.max(Math.min(naturalHeight, maxHeight), baseHeight);
      return Math.min(collapsedHeight, maxHeight);
    }

    function setDescriptionHeight(targetHeight, { immediate, overflowY }) {
      if (!descriptionInput) {
        return;
      }
      const resolvedTarget = Math.max(targetHeight, 0);
      const previousTransition = descriptionInput.style.transition;
      descriptionInput.style.maxHeight = `${computeDescriptionMaxHeight()}px`;
      if (immediate) {
        descriptionInput.style.transition = "none";
      } else {
        descriptionInput.style.transition = DESCRIPTION_TRANSITION;
        const currentHeight = descriptionInput.getBoundingClientRect().height || resolvedTarget;
        descriptionInput.style.height = `${currentHeight}px`;
        void descriptionInput.offsetHeight;
      }
      descriptionInput.style.height = `${resolvedTarget}px`;
      if (typeof overflowY === "string") {
        descriptionInput.style.overflowY = overflowY;
      }
      if (immediate) {
        void descriptionInput.offsetHeight;
        descriptionInput.style.transition = previousTransition || DESCRIPTION_TRANSITION;
      }
    }

    function expandDescription({ immediate }) {
      if (!descriptionInput) {
        return;
      }
      descriptionState.isExpanded = true;
      const maxHeight = computeDescriptionMaxHeight();
      descriptionInput.style.height = "auto";
      const naturalHeight = descriptionInput.scrollHeight;
      const lineHeight = getComputedLineHeight(descriptionInput);
      const targetHeight = Math.max(Math.min(naturalHeight, maxHeight), lineHeight);
      const overflow = naturalHeight > maxHeight ? "auto" : "hidden";
      setDescriptionHeight(targetHeight, { immediate, overflowY: overflow });
      descriptionInput.setAttribute("aria-expanded", "true");
    }

    function collapseDescription({ immediate }) {
      if (!descriptionInput) {
        return;
      }
      descriptionState.isExpanded = false;
      const targetHeight = computeDescriptionCollapsedHeight();
      setDescriptionHeight(targetHeight, { immediate, overflowY: "hidden" });
      descriptionInput.setAttribute("aria-expanded", "false");
      descriptionInput.scrollTop = 0;
    }

    function refreshDescriptionHeight({ immediate = false } = {}) {
      if (!descriptionInput) {
        return;
      }
      if (descriptionState.isExpanded) {
        expandDescription({ immediate });
      } else {
        collapseDescription({ immediate });
      }
    }

    function handleViewportResize() {
      refreshDescriptionHeight({ immediate: true });
    }

    function getSelectedLabel() {
      const selected = typeInputs.find((input) => input.checked);
      return selected ? selected.value : "";
    }

    function setTypeInvalid(isInvalid) {
      if (typeInvalidFeedback) {
        typeInvalidFeedback.classList.toggle("d-none", !isInvalid);
      }
      if (typeField) {
        typeField.classList.toggle("is-invalid", isInvalid);
        if (isInvalid) {
          typeField.setAttribute("aria-invalid", "true");
        } else {
          typeField.removeAttribute("aria-invalid");
        }
      }
      typeInputs.forEach((input) => {
        if (isInvalid) {
          input.setAttribute("aria-invalid", "true");
        } else {
          input.removeAttribute("aria-invalid");
        }
      });
    }

    function resetTypeState() {
      setTypeInvalid(false);
    }

    function resetAlerts() {
      if (successAlert) {
        successAlert.classList.add("d-none");
        successAlert.textContent = "";
      }
      if (errorAlert) {
        errorAlert.classList.add("d-none");
        errorAlert.textContent = "";
      }
    }

    function setSubmitting(isSubmitting) {
      if (submitButton) {
        submitButton.disabled = isSubmitting;
        submitButton.setAttribute("aria-busy", String(isSubmitting));
      }
      if (spinner) {
        spinner.classList.toggle("d-none", !isSubmitting);
      }
      if (submitLabel) {
        submitLabel.textContent = isSubmitting ? "Submitting..." : "Submit Feedback";
      }
    }

    modalElement.addEventListener("shown.bs.modal", function () {
      resetAlerts();
      form.classList.remove("was-validated");
      resetTypeState();
      if (titleInput) {
        updateTitleHeight();
      }
      if (descriptionInput) {
        descriptionInput.setAttribute("aria-expanded", "false");
        refreshDescriptionHeight({ immediate: true });
      }
      if (titleInput) {
        titleInput.focus();
      }
    });

    modalElement.addEventListener("hidden.bs.modal", function () {
      form.reset();
      form.classList.remove("was-validated");
      resetAlerts();
      setSubmitting(false);
      resetTypeState();
      if (titleInput) {
        updateTitleHeight();
      }
      if (descriptionInput) {
        descriptionState.isExpanded = false;
        refreshDescriptionHeight({ immediate: true });
      }
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      event.stopPropagation();

      form.classList.add("was-validated");
      const selectedLabel = getSelectedLabel();
      const formIsValid = form.checkValidity();
      if (!selectedLabel) {
        setTypeInvalid(true);
      }
      if (!formIsValid || !selectedLabel) {
        return;
      }

      if (!csrfInput || !csrfInput.value) {
        if (errorAlert) {
          errorAlert.textContent = "Unable to submit feedback: missing CSRF token.";
          errorAlert.classList.remove("d-none");
        }
        return;
      }

      const title = titleInput ? titleInput.value.trim() : "";
      const body = descriptionInput ? descriptionInput.value.trim() : "";
      const label = selectedLabel || "question";
      const payload = {
        title,
        body,
        labels: [label, "#feedback"],
        csrf_token: csrfInput.value,
      };

      setSubmitting(true);
      resetAlerts();

      try {
        const response = await fetch("/api/feedback", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        let data;
        try {
          data = await response.json();
        } catch (error) {
          data = {};
        }

        if (data && data.csrf_token && csrfInput) {
          csrfInput.value = data.csrf_token;
        }

        if (!response.ok || !data || !data.success) {
          const errorMessage = (data && data.message) || "Unable to submit feedback.";
          if (errorAlert) {
            errorAlert.textContent = errorMessage;
            errorAlert.classList.remove("d-none");
          }
          return;
        }

        form.reset();
        form.classList.remove("was-validated");
        resetTypeState();
        if (titleInput) {
          updateTitleHeight();
        }
        if (descriptionInput) {
          descriptionState.isExpanded = false;
          refreshDescriptionHeight({ immediate: true });
        }

        if (successAlert) {
          const issueUrl = data.issue_url;
          const issueNumber = data.issue_number;
          successAlert.textContent = "Thank you for your feedback!";
          if (issueUrl) {
            const link = document.createElement("a");
            link.href = issueUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.classList.add("feedback-success-link");
            const linkText = document.createElement("span");
            linkText.textContent = issueNumber ? `View issue #${issueNumber}` : "View created issue";
            const icon = document.createElement("i");
            icon.className = "bi bi-github";
            icon.setAttribute("aria-hidden", "true");
            successAlert.appendChild(document.createTextNode(" "));
            link.appendChild(icon);
            link.insertBefore(linkText, icon);
            successAlert.appendChild(link);
          }
          successAlert.classList.remove("d-none");
        }
      } catch (error) {
        if (errorAlert) {
          errorAlert.textContent = error && error.message ? error.message : "Unable to submit feedback.";
          errorAlert.classList.remove("d-none");
        }
      } finally {
        setSubmitting(false);
      }
    });

    if (titleInput) {
      titleInput.setAttribute("aria-expanded", "false");
      titleInput.style.overflowY = "hidden";
      titleInput.addEventListener("input", updateTitleHeight);
      titleInput.addEventListener("focus", updateTitleHeight);
      titleInput.addEventListener("blur", updateTitleHeight);
      updateTitleHeight();
    }

    if (descriptionInput) {
      descriptionInput.style.overflowY = "hidden";
      descriptionInput.setAttribute("aria-expanded", "false");
      descriptionInput.addEventListener("focus", function () {
        expandDescription({ immediate: false });
      });
      descriptionInput.addEventListener("blur", function () {
        collapseDescription({ immediate: false });
      });
      descriptionInput.addEventListener("input", function () {
        refreshDescriptionHeight({ immediate: false });
      });
      refreshDescriptionHeight({ immediate: true });
      window.addEventListener("resize", handleViewportResize);
    }

    if (typeInputs.length > 0) {
      typeInputs.forEach((input) => {
        input.addEventListener("change", function () {
          resetTypeState();
        });
      });
    }
  });
})();
