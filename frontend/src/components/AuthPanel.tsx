import { Button, Eyebrow, FeedbackMessage, Field } from "./ui";
import { FormEvent, useState } from "react";
import { LibraryMark } from "./LibraryIcon";
import { api, getErrorMessage } from "../lib/api";
import { AuthResponse } from "../types";

interface AuthPanelProps {
  setupRequired: boolean;
  onAuthenticated: (result: AuthResponse) => void;
}

export function AuthPanel({ setupRequired, onAuthenticated }: AuthPanelProps) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post<AuthResponse>(
        setupRequired ? "/auth/setup" : "/auth/login",
        setupRequired ? { fullName, username, password } : { username, password },
      );
      onAuthenticated(data);
    } catch (requestError) {
      setError(getErrorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="entry-page">
      <div className="entry-art" aria-hidden="true">
        <LibraryMark className="entry-art__seal" />
        <div className="entry-art__shelf entry-art__shelf--one">
          <i /><i /><i /><i /><i /><i />
        </div>
        <div className="entry-art__shelf entry-art__shelf--two">
          <i /><i /><i /><i /><i />
        </div>
        <div className="entry-art__shelf entry-art__shelf--three">
          <i /><i /><i /><i /><i /><i /><i />
        </div>
        <p>Every game has a place.<br />Every night, a story.</p>
      </div>

      <section className="entry-card">
        <Eyebrow>THE BOARD GAME LIBRARY</Eyebrow>
        <h1>{setupRequired ? "Make this place yours." : "Welcome back."}</h1>
        <p className="entry-copy">
          {setupRequired
            ? "Create the first keeper account to open your private collection."
            : "Sign in to return to your shelves and stories."}
        </p>

        <form className="entry-form" onSubmit={handleSubmit}>
          {setupRequired && (
            <Field label="Your name">
              <input
                autoComplete="name"
                maxLength={80}
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </Field>
          )}
          <Field label="Username">
            <input
              autoComplete="username"
              maxLength={32}
              minLength={3}
              onChange={(event) => setUsername(event.target.value)}
              pattern="(?:[a-zA-Z0-9._]|-)+"
              required
              value={username}
            />
          </Field>
          <Field label="Password" hint={setupRequired ? "Use at least 8 characters." : undefined}>
            <input
              autoComplete={setupRequired ? "new-password" : "current-password"}
              maxLength={128}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </Field>
          {error && (
            <FeedbackMessage className="form-error" message={error} onDismiss={() => setError("")} />
          )}
          <Button className="button--wide" disabled={submitting} variant="primary">
            {submitting
              ? "Unlocking..."
              : setupRequired
                ? "Open the library"
                : "Enter the library"}
          </Button>
        </form>

        <div className="entry-footnote">
          <span className="entry-footnote__rule" />
          <span>Private to your home network</span>
          <span className="entry-footnote__rule" />
        </div>
      </section>
    </main>
  );
}
