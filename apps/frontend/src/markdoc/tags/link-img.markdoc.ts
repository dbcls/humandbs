export const linkImg = {
  render: "LinkImg",
  description: "Link img",
  children: ["paragraph", "tag", "list"],
  attributes: {
    imgSrc: {
      type: String,
      description: "The source URL of the image",
      required: true,
    },
    alt: {
      type: String,
      description: "Alternative text for the image",
      required: false,
    },
    href: {
      type: String,
      description: "URL to link to",
      required: true,
    },
    text: {
      type: String,
      description: "Text to display",
      required: false,
    },
  },
};
