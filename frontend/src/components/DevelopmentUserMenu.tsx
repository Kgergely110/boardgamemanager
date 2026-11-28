import { Button, Eyebrow, FeedbackMessage } from "./ui";
import { FormEvent, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LibraryIcon } from "./LibraryIcon";
import { api, getErrorMessage } from "../lib/api";
import { Player } from "../types";

interface DevelopmentUserMenuProps {
  player: Player;
}

export function DevelopmentUserMenu({ player }: DevelopmentUserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isSaving) setIsOpen(false);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSaving]);

  if (!player.isAdmin) return null;

  function close() {
    if (isSaving) return;
    setIsOpen(false);
    setError("");
    setNotice("");
  }

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setError("");
    setNotice("");
    setIsSaving(true);
    try {
      const { data } = await api.post<{
        data: { fullName: string; username: string };
      }>("/dev/users", {
        fullName: String(formData.get("fullName") ?? ""),
        username: String(formData.get("username") ?? ""),
        password: String(formData.get("password") ?? ""),
      });
      setNotice(`Account created for ${data.data.fullName}.`);
      form.reset();
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="dev-user-menu">
      <span className="rail-label">Development</span>
      <Button
        className="shelf-nav__item dev-user-menu__trigger"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span className="shelf-nav__glyph"><LibraryIcon name="user" /></span>
        <span>Add a user</span>
      </Button>

      {isOpen && createPortal(
        <div className="play-log-modal-backdrop">
          <form
            aria-labelledby="dev-user-editor-title"
            aria-modal="true"
            className="play-log-editor dev-user-editor"
            onSubmit={createUser}
            role="dialog"
          >
            <header className="play-log-editor__heading">
              <div>
                <Eyebrow>LOCAL DEVELOPMENT</Eyebrow>
                <h2 id="dev-user-editor-title">Add a user</h2>
              </div>
              <Button
                aria-label="Close user form"
                className="play-log-editor__close"
                disabled={isSaving}
                onClick={close}
                type="button"
              >
                ×
              </Button>
            </header>
            <div className="play-log-editor__fields dev-user-editor__fields">
              <label>
                <span className="field-label">Full name</span>
                <input autoComplete="name" maxLength={80} name="fullName" required />
              </label>
              <label>
                <span className="field-label">Username</span>
                <input
                  autoComplete="username"
                  maxLength={32}
                  minLength={3}
                  name="username"
                  pattern="[A-Za-z0-9._-]+"
                  required
                />
              </label>
              <label>
                <span className="field-label">Password</span>
                <input
                  autoComplete="new-password"
                  maxLength={128}
                  minLength={8}
                  name="password"
                  required
                  type="password"
                />
              </label>
            </div>
            {error && (
              <FeedbackMessage
                className="form-error dev-user-editor__message"
                message={error}
                onDismiss={() => setError("")}
              />
            )}
            {notice && (
              <FeedbackMessage
                className="dev-user-editor__success"
                message={notice}
                onDismiss={() => setNotice("")}
                tone="success"
              />
            )}
            <div className="play-log-editor__footer">
              <Button className="button button--quiet" disabled={isSaving} onClick={close} type="button">
                Cancel
              </Button>
              <Button className="button button--primary" disabled={isSaving} type="submit">
                {isSaving ? "Creating…" : "Create user"}
              </Button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </div>
  );
}
