import React, { useEffect, useState } from "react";
import api from "../api/api";
import { useAuth } from "../context/AuthContext";
import { useNavigate } from "react-router-dom";

function EditProfilePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [bio, setBio] = useState("");
  const [skills, setSkills] = useState("");
  const [socialLinks, setSocialLinks] = useState([]);
  const [error, setError] = useState("");

  const normalizeUrl = (url) => {
    if (!/^https?:\/\//i.test(url)) {
      return "https://" + url;
    }
    return url;
  };

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      try {
        const res = await api.get(`/users/${user.id}/edit`);
        const u = res.data.user;

        setBio(u.bio || "");
        setSkills(u.skills || "");

        if (u.social_links) {
          const parsedLinks = u.social_links.split(",").map(link => {
            const [label = "", url = ""] = link.split("|").map(x => x?.trim() || "");
            return { label, url };
          });
          setSocialLinks(parsedLinks);
        } else {
          setSocialLinks([]);
        }

      } catch (err) {
        console.error("Error fetching profile:", err);
        setError("Failed to fetch profile data");
      }
    };

    fetchProfile();
  }, [user]);

  const handleSocialChange = (index, field, value) => {
    const updated = [...socialLinks];
    updated[index][field] = value;
    setSocialLinks(updated);
  };

  const addSocialLink = () => {
    setSocialLinks([...socialLinks, { label: "", url: "" }]);
  };

  const removeSocialLink = (index) => {
    const updated = [...socialLinks];
    updated.splice(index, 1);
    setSocialLinks(updated);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const linkString = socialLinks
      .filter(link => link.label && link.url)
      .map(link => `${link.label.trim()}|${normalizeUrl(link.url.trim())}`)
      .join(",");

    try {
      await api.put(`/users/${user.id}`, {
        bio,
        skills,
        social_links: linkString
      });

      navigate(`/profile/${user.id}`);
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("Failed to update profile");
    }
  };

  return (
    <div className="container">
      <h2>Edit Profile</h2>
      {error && <p style={{ color: "red" }}>{error}</p>}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: "15px" }}>
          <label>Bio:</label><br />
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>Skills (comma separated):</label><br />
          <input value={skills} onChange={(e) => setSkills(e.target.value)} />
        </div>

        <div style={{ marginBottom: "15px" }}>
          <label>Social Links:</label><br />
          {socialLinks.map((link, index) => (
            <div key={index} style={{ marginBottom: "8px" }}>
              <input
                placeholder="Label (e.g., GitHub)"
                value={link.label}
                onChange={(e) => handleSocialChange(index, "label", e.target.value)}
                style={{ marginRight: "5px", width: "30%" }}
              />
              <input
                placeholder="https://url.com"
                value={link.url}
                onChange={(e) => handleSocialChange(index, "url", e.target.value)}
                style={{ marginRight: "5px", width: "50%" }}
              />
              <button type="button" onClick={() => removeSocialLink(index)}>❌</button>
            </div>
          ))}
          <button type="button" onClick={addSocialLink}>Add Link</button>
        </div>

        <button type="submit">Save Profile</button>
      </form>
    </div>
  );
}

export default EditProfilePage;
