interface ContentItemRepo {
  /**
   * Private
   * Gets ContentItems from CMS
   */
  getContentItems: () => Promise<ContentItemRaw[]>;
}

export type ContentItemRaw = {};
