interface ContentItemRepo {
  /**
   * Private
   * Gets ContentItems from CMS
   */
  getContentItems: () => Promise<ContentItemRaw[]>;
}

export interface ContentItemRaw {}
