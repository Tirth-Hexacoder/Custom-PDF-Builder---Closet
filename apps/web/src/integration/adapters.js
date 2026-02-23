export const authAdapter = {
  async login({ email }) {
    return { id: "u-1", name: email?.split("@")[0] || "designer" };
  },
  async getSession() {
    return null;
  }
};

export const storageAdapter = {
  saveDraft() {
    // Draft persistence is disabled for this project.
  },
  loadDraft() {
    return null;
  },
  clearDraft() {
    localStorage.removeItem("modular-closet-pdf-draft");
  }
};

export const exportAdapter = {
  async exportPDF({ blobs }) {
    return blobs;
  }
};
