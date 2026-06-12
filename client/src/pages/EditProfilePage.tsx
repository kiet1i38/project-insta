import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ApiError,
  getOwnProfile,
  updateOwnProfile,
  type OwnProfile
} from "../modules/auth/authApi";
import {
  buildProfileUpdateInput,
  toProfileFormValues,
  validateProfileForm,
  type ProfileFormErrors,
  type ProfileFormValues
} from "./profileValidation";

type EditProfileLocationState = {
  profile?: OwnProfile;
};

export function EditProfilePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as EditProfileLocationState | null;
  const [profile, setProfile] = useState<OwnProfile | null>(
    locationState?.profile ?? null
  );
  const [values, setValues] = useState<ProfileFormValues>(() =>
    locationState?.profile
      ? toProfileFormValues(locationState.profile)
      : {
          avatarUrl: "",
          bio: "",
          displayName: ""
        }
  );
  const [errors, setErrors] = useState<ProfileFormErrors>({});
  const [formMessage, setFormMessage] = useState<{
    text: string;
    tone: "error" | "info";
  } | null>(null);
  const [isLoading, setIsLoading] = useState(locationState?.profile === undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (profile) {
      setIsLoading(false);
      return;
    }

    let isActive = true;

    async function loadProfile() {
      setIsLoading(true);
      setFormMessage(null);

      try {
        const response = await getOwnProfile();

        if (!isActive) {
          return;
        }

        setProfile(response.profile);
        setValues(toProfileFormValues(response.profile));
      } catch (error) {
        if (!isActive) {
          return;
        }

        setFormMessage({
          text:
            error instanceof ApiError
              ? error.message
              : "Could not load the profile editor right now. Please try again.",
          tone: "error"
        });
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [profile]);

  function updateField(field: keyof ProfileFormValues, value: string) {
    setValues((current) => ({
      ...current,
      [field]: value
    }));
    setFormMessage(null);
    setErrors((current) => {
      if (!current[field]) {
        return current;
      }

      const nextErrors = { ...current };
      delete nextErrors[field];
      return nextErrors;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validateProfileForm(values);

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return;
    }

    setFormMessage(null);
    setIsSubmitting(true);

    try {
      const response = await updateOwnProfile(buildProfileUpdateInput(values));

      navigate("/profile", {
        replace: true,
        state: {
          notice: "Profile updated.",
          profile: response.profile
        }
      });
    } catch (error) {
      setFormMessage({
        text:
          error instanceof ApiError
            ? error.message
            : "Could not save the profile right now. Please try again.",
        tone: "error"
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel profile-page">
      <div className="auth-copy">
        <p className="eyebrow">Slice 5B</p>
        <h2>Edit your profile</h2>
        <p>
          Update your public account details through the same protected
          `/users/me` contract the backend already verifies.
        </p>
      </div>

      {isLoading ? (
        <p>Loading the current profile values from the backend.</p>
      ) : (
        <form className="auth-form profile-form" noValidate onSubmit={handleSubmit}>
          <label className="form-field" htmlFor="profile-display-name">
            <span>Display name</span>
            <input
              id="profile-display-name"
              name="displayName"
              type="text"
              value={values.displayName}
              onChange={(event) => updateField("displayName", event.target.value)}
              aria-invalid={errors.displayName ? "true" : "false"}
              aria-describedby={
                errors.displayName ? "profile-display-name-error" : undefined
              }
            />
            {errors.displayName ? (
              <small className="field-error" id="profile-display-name-error">
                {errors.displayName}
              </small>
            ) : null}
          </label>

          <label className="form-field" htmlFor="profile-avatar-url">
            <span>Avatar URL</span>
            <input
              id="profile-avatar-url"
              name="avatarUrl"
              type="url"
              value={values.avatarUrl}
              onChange={(event) => updateField("avatarUrl", event.target.value)}
              aria-invalid={errors.avatarUrl ? "true" : "false"}
              aria-describedby={
                errors.avatarUrl ? "profile-avatar-url-error" : undefined
              }
            />
            {errors.avatarUrl ? (
              <small className="field-error" id="profile-avatar-url-error">
                {errors.avatarUrl}
              </small>
            ) : null}
          </label>

          <label className="form-field" htmlFor="profile-bio">
            <span>Bio</span>
            <textarea
              id="profile-bio"
              name="bio"
              rows={5}
              value={values.bio}
              onChange={(event) => updateField("bio", event.target.value)}
              aria-invalid={errors.bio ? "true" : "false"}
              aria-describedby={errors.bio ? "profile-bio-error" : undefined}
            />
            {errors.bio ? (
              <small className="field-error" id="profile-bio-error">
                {errors.bio}
              </small>
            ) : null}
          </label>

          <div className="auth-actions">
            {formMessage ? (
              <p className="form-status" data-tone={formMessage.tone} role="status">
                {formMessage.text}
              </p>
            ) : null}
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Saving profile..." : "Save profile"}
            </button>
            <Link
              className="button-link-inline secondary-inline-link"
              state={profile ? { profile } : undefined}
              to="/profile"
            >
              Cancel
            </Link>
          </div>
        </form>
      )}
    </section>
  );
}
