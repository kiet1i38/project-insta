import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ApiError,
  deleteOwnPost,
  getOwnPosts,
  getOwnProfile,
  type OwnPost,
  type OwnProfile
} from "../modules/auth/authApi";

type ProfilePageLocationState = {
  notice?: string;
  profile?: OwnProfile;
};

function getAvatarLabel(profile: OwnProfile | null): string {
  if (!profile?.displayName?.trim()) {
    return "?";
  }

  return profile.displayName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatPostDate(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(new Date(isoTimestamp));
}

export function ProfilePage() {
  const location = useLocation();
  const navigate = useNavigate();
  const locationState = location.state as ProfilePageLocationState | null;
  const [profile, setProfile] = useState<OwnProfile | null>(
    locationState?.profile ?? null
  );
  const [posts, setPosts] = useState<OwnPost[]>([]);
  const [isProfileLoading, setIsProfileLoading] = useState(
    locationState?.profile === undefined
  );
  const [isPostsLoading, setIsPostsLoading] = useState(true);
  const [isDeletingPostId, setIsDeletingPostId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(
    locationState?.notice ?? null
  );

  useEffect(() => {
    if (locationState) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.pathname, locationState, navigate]);

  useEffect(() => {
    if (locationState?.profile) {
      setIsProfileLoading(false);
      return;
    }

    let isActive = true;

    async function loadProfile() {
      setIsProfileLoading(true);
      setErrorMessage(null);

      try {
        const response = await getOwnProfile();

        if (!isActive) {
          return;
        }

        setProfile(response.profile);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "Could not load the profile right now. Please try again."
        );
      } finally {
        if (isActive) {
          setIsProfileLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      isActive = false;
    };
  }, [locationState?.profile]);

  useEffect(() => {
    let isActive = true;

    async function loadPosts() {
      setIsPostsLoading(true);
      setErrorMessage(null);

      try {
        const response = await getOwnPosts();

        if (!isActive) {
          return;
        }

        setPosts(response.posts);
      } catch (error) {
        if (!isActive) {
          return;
        }

        setErrorMessage(
          error instanceof ApiError
            ? error.message
            : "Could not load profile posts right now. Please try again."
        );
      } finally {
        if (isActive) {
          setIsPostsLoading(false);
        }
      }
    }

    void loadPosts();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleDeletePost(post: OwnPost): Promise<void> {
    setErrorMessage(null);
    setNotice(null);
    setIsDeletingPostId(post.id);

    try {
      await deleteOwnPost(post.id);
      setPosts((currentPosts) =>
        currentPosts.filter((currentPost) => currentPost.id !== post.id)
      );
      setProfile((currentProfile) => {
        if (!currentProfile) {
          return currentProfile;
        }

        return {
          ...currentProfile,
          counts: {
            ...currentProfile.counts,
            posts: Math.max(currentProfile.counts.posts - 1, 0)
          }
        };
      });
      setNotice("Post deleted.");
    } catch (error) {
      setErrorMessage(
        error instanceof ApiError
          ? error.message
          : "Could not delete the post right now. Please try again."
      );
    } finally {
      setIsDeletingPostId(null);
    }
  }

  const avatarLabel = getAvatarLabel(profile);
  const isLoading = isProfileLoading || isPostsLoading;

  if (isLoading) {
    return (
      <section className="panel profile-page">
        <p className="eyebrow">Slice 6C</p>
        <h2>Your profile</h2>
        <p>
          Loading the protected profile view and real post grid from the
          backend.
        </p>
      </section>
    );
  }

  if (!profile) {
    return (
      <section className="panel profile-page">
        <p className="eyebrow">Slice 6C</p>
        <h2>Your profile</h2>
        <p className="form-status" data-tone="error" role="status">
          {errorMessage ?? "Could not load the profile right now."}
        </p>
      </section>
    );
  }

  return (
    <section className="panel profile-page">
      <div className="profile-hero">
        {profile.avatarUrl ? (
          <img
            alt={`Avatar for ${profile.displayName ?? profile.username}`}
            className="profile-avatar"
            src={profile.avatarUrl}
          />
        ) : (
          <div aria-hidden="true" className="profile-avatar profile-avatar-fallback">
            {avatarLabel}
          </div>
        )}

        <div className="profile-main">
          <div className="profile-headline-row">
            <div className="profile-headline-copy">
              <p className="profile-kicker">Profile</p>
              <h2>Your profile</h2>
              <p className="profile-username-display">@{profile.username}</p>
            </div>

            <div className="profile-hero-actions">
              <Link
                className="button-link-inline secondary-inline-link"
                state={{ profile }}
                to="/profile/edit"
              >
                Edit profile
              </Link>
            </div>
          </div>

          <div className="profile-stat-inline">
            <div className="profile-stat-inline-item">
              <strong>{profile.counts.posts}</strong>
              <span>Posts</span>
            </div>
            <div className="profile-stat-inline-item">
              <strong>{profile.counts.followers}</strong>
              <span>Followers</span>
            </div>
            <div className="profile-stat-inline-item">
              <strong>{profile.counts.following}</strong>
              <span>Following</span>
            </div>
          </div>

          <div className="profile-copy">
            <p className="profile-name">{profile.displayName ?? profile.username}</p>
            <p className="profile-bio">
              {profile.bio ??
                "Add a short bio so classmates and reviewers can understand your account story faster."}
            </p>
            <div className="profile-meta-pills">
              <span className="profile-meta-pill">{profile.role}</span>
              <span className="profile-meta-pill">{profile.status}</span>
            </div>
          </div>
        </div>
      </div>

      <section className="profile-section">
        <div className="profile-gallery-bar">
          <div className="profile-gallery-tabs" aria-label="Profile content overview">
            <span className="profile-gallery-tab profile-gallery-tab-active">Posts</span>
            <span className="profile-gallery-tab">{profile.role}</span>
            <span className="profile-gallery-tab">{profile.status}</span>
          </div>
          <div className="profile-gallery-feedback">
            {notice ? (
              <p className="form-status" data-tone="info" role="status">
                {notice}
              </p>
            ) : null}
            {errorMessage ? (
              <p className="form-status" data-tone="error" role="status">
                {errorMessage}
              </p>
            ) : null}
          </div>
        </div>

        <div className="profile-section-heading">
          <h3>Posts</h3>
          <p>
            Visible posts from your account stay together in one clean gallery
            that is easy to scan and manage.
          </p>
        </div>

        {posts.length === 0 ? (
          <div className="profile-empty-state">
            <h4>No posts yet. Share your first photo when you are ready.</h4>
            <p>
              Once you publish something, it will appear here in the same
              profile grid.
            </p>
          </div>
        ) : (
          <div className="profile-post-grid">
            {posts.map((post) => (
              <article className="profile-post-tile" key={post.id}>
                <img
                  alt={
                    post.caption
                      ? `Post image for ${post.caption}`
                      : "Profile post image"
                  }
                  className="profile-post-media"
                  src={post.imageUrl}
                />
                <div className="profile-post-content">
                  <p className="profile-post-caption">
                    {post.caption ?? "Untitled post"}
                  </p>
                  <p className="profile-post-meta">
                    Posted {formatPostDate(post.createdAt)}
                  </p>
                  <button
                    aria-label={`Delete ${post.caption ?? "untitled post"}`}
                    className="profile-post-delete-button"
                    disabled={isDeletingPostId === post.id}
                    onClick={() => void handleDeletePost(post)}
                    type="button"
                  >
                    {isDeletingPostId === post.id ? "Deleting..." : "Delete post"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
