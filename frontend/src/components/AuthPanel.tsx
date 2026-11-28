import { Button, Eyebrow, FeedbackMessage, Field, Input } from "./ui";
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
        <Eyebrow>Board game manager</Eyebrow>
        <h1>{setupRequired ? "Create your account" : "Sign in"}</h1>
        <p className="entry-copy">
          {setupRequired
            ? "Set up the first account to start organizing your collection."
            : "Access your games, notes, and play history."}
        </p>

        <form className="entry-form" onSubmit={handleSubmit}>
          {setupRequired && (
            <Field label="Name">
              <Input
                autoComplete="name"
                maxLength={80}
                onChange={(event) => setFullName(event.target.value)}
                required
                value={fullName}
              />
            </Field>
          )}
          <Field label="Username">
            <Input
              autoComplete="username"
              maxLength={32}
              minLength={3}
              onChange={(event) => setUsername(event.target.value)}
              pattern="(?:[a-zA-Z0-9._]|-)+"
              required
              value={username}
            />
          </Field>
          <Field label="Password" hint={setupRequired ? "At least 8 characters." : undefined}>
            <Input
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
              ? setupRequired ? "Creating account…" : "Signing in…"
              : setupRequired ? "Create account" : "Sign in"}
          </Button>
        </form>
      </section>
    </main>
  );
}
