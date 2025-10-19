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
    const labelSelect = form.querySelector("#feedbackLabel");
    const successAlert = form.querySelector("[data-feedback-success]");
    const errorAlert = form.querySelector("[data-feedback-error]");
    const submitButton = form.querySelector("[data-feedback-submit]");
    const submitLabel = form.querySelector("[data-feedback-submit-label]");
    const spinner = form.querySelector("[data-feedback-spinner]");
    const csrfInput = form.querySelector('input[name="csrf_token"]');

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
      if (titleInput) {
        titleInput.focus();
      }
    });

    modalElement.addEventListener("hidden.bs.modal", function () {
      form.reset();
      form.classList.remove("was-validated");
      resetAlerts();
      setSubmitting(false);
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      event.stopPropagation();

      form.classList.add("was-validated");
      if (!form.checkValidity()) {
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
      const label = labelSelect ? labelSelect.value : "question";
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

        if (successAlert) {
          const issueUrl = data.issue_url;
          const issueNumber = data.issue_number;
          successAlert.textContent = "Thank you for your feedback! ";
          if (issueUrl) {
            const link = document.createElement("a");
            link.href = issueUrl;
            link.target = "_blank";
            link.rel = "noopener noreferrer";
            link.textContent = issueNumber ? `View issue #${issueNumber}` : "View created issue";
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
  });
})();
