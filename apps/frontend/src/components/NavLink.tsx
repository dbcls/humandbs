import { createLink, LinkComponent } from "@tanstack/react-router";
import React from "react";

interface BasicLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  // Add any additional props you want to pass to the anchor element
}

const BasicLinkComponent = React.forwardRef<HTMLAnchorElement, BasicLinkProps>(
  (props, ref) => {
    return <a ref={ref} {...props} />;
  }
);
const CreatedLinkComponent = createLink(BasicLinkComponent);

export const NavLink: LinkComponent<typeof BasicLinkComponent> = (props) => {
  return (
    <CreatedLinkComponent
      preload={"intent"}
      className="[&.active]:text-secondary w-fit font-medium whitespace-nowrap"
      {...props}
    />
  );
};
