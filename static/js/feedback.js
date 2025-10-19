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
    const modalDialog = modalElement.querySelector(".modal-dialog");
    const modalContent = modalElement.querySelector(".modal-content");
    const typeInputs = Array.from(form.querySelectorAll('input[name="label"]'));
    const typeField = form.querySelector('[data-feedback-type-field]');
    const typeInvalidFeedback = form.querySelector('[data-feedback-type-invalid]');
    const successAlert = form.querySelector("[data-feedback-success]");
    const errorAlert = form.querySelector("[data-feedback-error]");
    const submitButton = form.querySelector("[data-feedback-submit]");
    const submitLabel = form.querySelector("[data-feedback-submit-label]");
    const spinner = form.querySelector("[data-feedback-spinner]");
    const csrfInput = form.querySelector('input[name="csrf_token"]');
    const modalHeader = modalContent ? modalContent.querySelector(".modal-header") : null;
    const modalFooter = modalContent ? modalContent.querySelector(".modal-footer") : null;
    const modalBody = modalContent ? modalContent.querySelector(".modal-body") : null;
    const typeLinkContainer = form.querySelector("[data-feedback-type-link]");
    const typeLinkAnchor = typeLinkContainer
      ? typeLinkContainer.querySelector("[data-feedback-type-link-anchor]")
      : null;
    const typeLinkText = typeLinkContainer
      ? typeLinkContainer.querySelector("[data-feedback-type-link-text]")
      : null;

    const TYPE_LINKS = Object.freeze({
      bug: {
        href: "https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue%20state%3Aopen%20label%3Abug",
        text: "Check Known Bugs",
      },
      enhancement: {
        href: "https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue%20state%3Aopen%20label%3Aenhancement",
        text: "Check Upcoming Enhancements",
      },
      question: {
        href: "https://github.com/hamlet2k/ProjectsManager/issues?q=is%3Aissue%20label%3Aquestion",
        text: "Check Existing Questions",
      },
    });

    const autosizeElements = Array.from(
      form.querySelectorAll("[data-feedback-autosize]")
    );
    const autosizeState = new Map();
    const AUTOSIZE_TRANSITION = "height 0.2s ease";

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

    function computeModalMaxHeight() {
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      const eightyPercent = Math.floor(viewportHeight * 0.8);
      return Math.max(eightyPercent, 240);
    }

    function applyModalMaxHeight() {
      const maxHeight = computeModalMaxHeight();
      if (modalDialog) {
        modalDialog.style.maxHeight = `${maxHeight}px`;
      }
      if (modalContent) {
        modalContent.style.maxHeight = `${maxHeight}px`;
      }
      if (modalBody) {
        const headerHeight = modalHeader ? modalHeader.offsetHeight : 0;
        const footerHeight = modalFooter ? modalFooter.offsetHeight : 0;
        const bodyMax = Math.max(maxHeight - headerHeight - footerHeight, 0);
        modalBody.style.maxHeight = `${bodyMax}px`;
      }
      return maxHeight;
    }

    function ensureTextareaState(textarea) {
      let state = autosizeState.get(textarea);
      if (!state) {
        const lineHeight = getComputedLineHeight(textarea);
        const rows = Number.parseInt(textarea.getAttribute("rows") || "1", 10);
        const minHeight = Math.max(lineHeight * rows, lineHeight);
        state = { minHeight };
        autosizeState.set(textarea, state);
        textarea.style.minHeight = `${minHeight}px`;
        textarea.setAttribute("aria-expanded", "false");
        textarea.style.overflowY = "hidden";
      }
      return state;
    }

    function getVerticalMargins(element) {
      if (!element) {
        return 0;
      }
      const style = window.getComputedStyle(element);
      const top = parseFloat(style.marginTop) || 0;
      const bottom = parseFloat(style.marginBottom) || 0;
      return top + bottom;
    }

    function computeReservedHeight(textarea, currentHeight) {
      let reserved = 0;
      if (modalHeader) {
        reserved += modalHeader.offsetHeight + getVerticalMargins(modalHeader);
      }
      if (modalFooter) {
        reserved += modalFooter.offsetHeight + getVerticalMargins(modalFooter);
      }
      if (modalBody) {
        const bodyStyle = window.getComputedStyle(modalBody);
        const paddingTop = parseFloat(bodyStyle.paddingTop) || 0;
        const paddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
        reserved += paddingTop + paddingBottom;

        Array.from(modalBody.children).forEach((child) => {
          reserved += getVerticalMargins(child);
          if (child.contains(textarea)) {
            reserved += Math.max(child.offsetHeight - currentHeight, 0);
          } else {
            reserved += child.offsetHeight;
          }
        });
      }
      return reserved;
    }

    function refreshTextareaHeight(textarea, { immediate = false } = {}) {
      if (!textarea) {
        return;
      }
      const maxModalHeight = applyModalMaxHeight();
      const { minHeight } = ensureTextareaState(textarea);
      const currentHeight = Math.max(textarea.offsetHeight, minHeight);
      const reservedHeight = computeReservedHeight(textarea, currentHeight);
      const availableSpace = Math.max(maxModalHeight - reservedHeight, minHeight);
      const previousTransition = textarea.style.transition;
      if (immediate) {
        textarea.style.transition = "none";
      } else {
        textarea.style.transition = AUTOSIZE_TRANSITION;
      }
      textarea.style.height = "auto";
      const naturalHeight = textarea.scrollHeight;
      const targetHeight = Math.min(Math.max(naturalHeight, minHeight), availableSpace);
      textarea.style.height = `${targetHeight}px`;
      textarea.style.maxHeight = `${availableSpace}px`;
      textarea.style.overflowY = naturalHeight > availableSpace ? "auto" : "hidden";
      textarea.setAttribute("aria-expanded", targetHeight > minHeight + 1 ? "true" : "false");
      if (immediate) {
        requestAnimationFrame(() => {
          textarea.style.transition = previousTransition || AUTOSIZE_TRANSITION;
        });
      }
    }

    function refreshAllTextareaHeights({ immediate = false } = {}) {
      applyModalMaxHeight();
      autosizeElements.forEach((textarea) => {
        refreshTextareaHeight(textarea, { immediate });
      });
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

    function updateTypeLink({ refresh = true } = {}) {
      if (!typeLinkContainer || !typeLinkAnchor || !typeLinkText) {
        return;
      }

      const selectedLabel = getSelectedLabel();
      const linkConfig = TYPE_LINKS[selectedLabel];
      const wasHidden = typeLinkContainer.classList.contains("d-none");

      if (!linkConfig) {
        if (!wasHidden) {
          typeLinkContainer.classList.add("d-none");
        }
        typeLinkContainer.setAttribute("aria-hidden", "true");
        typeLinkAnchor.removeAttribute("href");
        typeLinkText.textContent = "";
        if (refresh && !wasHidden) {
          refreshAllTextareaHeights({ immediate: true });
        }
        return;
      }

      const previousText = typeLinkText.textContent;
      typeLinkAnchor.href = linkConfig.href;
      typeLinkText.textContent = linkConfig.text;
      typeLinkContainer.classList.remove("d-none");
      typeLinkContainer.removeAttribute("aria-hidden");

      if (refresh && (wasHidden || previousText !== linkConfig.text)) {
        refreshAllTextareaHeights({ immediate: true });
      }
    }

    function resetTypeState() {
      setTypeInvalid(false);
      updateTypeLink();
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
      refreshAllTextareaHeights({ immediate: true });
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
      refreshAllTextareaHeights({ immediate: true });
      if (titleInput) {
        titleInput.focus();
      } else if (autosizeElements.length > 0) {
        autosizeElements[0].focus();
      }
    });

    modalElement.addEventListener("hidden.bs.modal", function () {
      form.reset();
      form.classList.remove("was-validated");
      resetAlerts();
      setSubmitting(false);
      resetTypeState();
      autosizeElements.forEach((textarea) => {
        const { minHeight } = ensureTextareaState(textarea);
        textarea.style.height = `${minHeight}px`;
        textarea.style.overflowY = "hidden";
        textarea.setAttribute("aria-expanded", "false");
      });
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      event.stopPropagation();

      form.classList.add("was-validated");
      const selectedLabel = getSelectedLabel();
      const formIsValid = form.checkValidity();
      if (!selectedLabel) {
        setTypeInvalid(true);
        updateTypeLink();
      }
      if (!formIsValid || !selectedLabel) {
        return;
      }

      if (!csrfInput || !csrfInput.value) {
        if (errorAlert) {
          errorAlert.textContent = "Unable to submit feedback: missing CSRF token.";
          errorAlert.classList.remove("d-none");
        }
        refreshAllTextareaHeights({ immediate: true });
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
          refreshAllTextareaHeights({ immediate: true });
          return;
        }

        form.reset();
        form.classList.remove("was-validated");
        resetTypeState();
        refreshAllTextareaHeights({ immediate: true });

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
          refreshAllTextareaHeights({ immediate: true });
        }
      } catch (error) {
        if (errorAlert) {
          errorAlert.textContent = error && error.message ? error.message : "Unable to submit feedback.";
          errorAlert.classList.remove("d-none");
          refreshAllTextareaHeights({ immediate: true });
        }
      } finally {
        setSubmitting(false);
      }
    });

    autosizeElements.forEach((textarea) => {
      ensureTextareaState(textarea);
      textarea.addEventListener("input", function () {
        refreshTextareaHeight(textarea);
      });
      textarea.addEventListener("focus", function () {
        refreshTextareaHeight(textarea, { immediate: true });
      });
      textarea.addEventListener("blur", function () {
        refreshTextareaHeight(textarea, { immediate: true });
      });
    });

    refreshAllTextareaHeights({ immediate: true });

    window.addEventListener("resize", function () {
      refreshAllTextareaHeights({ immediate: true });
    });

    if (typeInputs.length > 0) {
      typeInputs.forEach((input) => {
        input.addEventListener("change", function () {
          resetTypeState();
        });
      });
    }

    updateTypeLink({ refresh: false });
  });
})();
