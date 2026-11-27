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
      <span className="rail-label">DEVELOPMENT</span>
      <button
        className="shelf-nav__item dev-user-menu__trigger"
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span className="shelf-nav__glyph"><LibraryIcon name="user" /></span>
        <span>Add a user</span>
      </button>

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
                <span className="eyebrow">LOCAL DEVELOPMENT</span>
                <h2 id="dev-user-editor-title">Add a user</h2>
              </div>
              <button
                aria-label="Close user form"
                className="play-log-editor__close"
                disabled={isSaving}
                onClick={close}
                type="button"
              >
                ×
              </button>
            </header>
            <div className="play-log-editor__fields dev-user-editor__fields">
              <label>
                Full name
                <input autoComplete="name" maxLength={80} name="fullName" required />
              </label>
              <label>
                Username
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
                Password
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
            {error && <p className="form-error dev-user-editor__message" role="alert">{error}</p>}
            {notice && <p className="dev-user-editor__success" role="status">{notice}</p>}
            <div className="play-log-editor__footer">
              <button className="button button--quiet" disabled={isSaving} onClick={close} type="button">
                Cancel
              </button>
              <button className="button button--primary" disabled={isSaving} type="submit">
                {isSaving ? "Creating…" : "Create user"}
              </button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </div>
  );
}
