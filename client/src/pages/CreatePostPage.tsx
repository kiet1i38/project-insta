import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, createPost } from "../modules/auth/authApi";
import { useAuthSession } from "../modules/auth/authSessionContext";

const maxCaptionLength = 2200;

export function CreatePostPage() {
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const previewUrl = useMemo(() => {
    if (!selectedImage) {
      return null;
    }

    if (typeof URL.createObjectURL !== "function") {
      return null;
    }

    return URL.createObjectURL(selectedImage);
  }, [selectedImage]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  function handleFileChange(file: File | null) {
    setSelectedImage(file);
    setErrorMessage(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedCaption = caption.trim();

    if (!selectedImage) {
      setErrorMessage("Choose an image before sharing your post.");
      return;
    }

    if (trimmedCaption.length > maxCaptionLength) {
      setErrorMessage("Caption must be 2200 characters or fewer.");
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await createPost({
        caption: trimmedCaption,
        image: selectedImage
      });

      navigate("/profile", {
        replace: true,
        state: {
          notice: "Post created."
        }
      });
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Could not create the post right now. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="panel create-post-page">
      <div className="auth-copy create-post-hero">
        <p className="auth-kicker">Create</p>
        <h2>Create new post</h2>
        <p>Upload a photo, write a caption, and publish it into your local demo feed.</p>
      </div>

      <form className="create-post-layout" noValidate onSubmit={handleSubmit}>
        <div className="create-post-media-panel">
          {previewUrl ? (
            <div className="create-post-preview-wrap">
              <img
                alt="Selected post preview"
                className="create-post-preview"
                src={previewUrl}
              />
            </div>
          ) : (
            <label className="create-post-dropzone" htmlFor="create-post-image">
              <span className="create-post-dropzone-icon" aria-hidden="true">
                +
              </span>
              <strong>Tap or click to select photo</strong>
              <p>Choose one JPG, PNG, or WebP image from your computer.</p>
            </label>
          )}

          <input
            accept="image/jpeg,image/png,image/webp"
            aria-label="Post image"
            className="create-post-file-input"
            id="create-post-image"
            onChange={(event) =>
              handleFileChange(event.currentTarget.files?.[0] ?? null)
            }
            type="file"
          />

          <div className="create-post-media-actions">
            <label className="button-link-inline secondary-inline-link" htmlFor="create-post-image">
              {selectedImage ? "Choose another image" : "Select from computer"}
            </label>
            {selectedImage ? (
              <button
                className="button-link-inline secondary-inline-link"
                onClick={() => handleFileChange(null)}
                type="button"
              >
                Remove image
              </button>
            ) : null}
          </div>
        </div>

        <div className="create-post-form-panel">
          <div className="create-post-author-row">
            <div className="create-post-author-avatar" aria-hidden="true">
              {user?.displayName?.trim().charAt(0).toUpperCase() ||
                user?.username.charAt(0).toUpperCase() ||
                "Y"}
            </div>
            <div>
              <strong>{user?.displayName?.trim() || user?.username || "Your account"}</strong>
              <p>Share a caption that fits the new polished social surface.</p>
            </div>
          </div>

          <label className="form-field" htmlFor="create-post-caption">
            <span>Caption</span>
            <textarea
              id="create-post-caption"
              maxLength={maxCaptionLength}
              onChange={(event) => {
                setCaption(event.currentTarget.value);
                setErrorMessage(null);
              }}
              placeholder="Write a caption..."
              rows={8}
              value={caption}
            />
          </label>

          <div className="create-post-caption-meta">
            <span>{caption.trim().length}/{maxCaptionLength}</span>
            <span>Caption is optional, image is required.</span>
          </div>

          <div className="create-post-settings">
            <div className="create-post-setting-row">
              <strong>Add location</strong>
              <span>Planned visual setting for later parity, not saved yet.</span>
            </div>
            <div className="create-post-setting-row">
              <strong>Advanced settings</strong>
              <span>Accessibility, comments, and extra options stay future-facing for now.</span>
            </div>
          </div>

          {errorMessage ? (
            <p className="form-status" data-tone="error" role="status">
              {errorMessage}
            </p>
          ) : null}

          <div className="create-post-submit-row">
            <Link className="button-link-inline secondary-inline-link" to="/">
              Cancel
            </Link>
            <button className="primary-button" disabled={isSubmitting} type="submit">
              {isSubmitting ? "Sharing..." : "Share post"}
            </button>
          </div>
        </div>
      </form>
    </section>
  );
}
