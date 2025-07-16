export interface LinkImgProps {
  href: string;
  imgSrc: string;
  alt?: string;
  text?: string;
}

export function LinkImg(props: LinkImgProps) {
  return (
    <a href={props.href}>
      <span>{props.text}</span>
      <img
        src={props.imgSrc}
        className="not-prose inline h-4 leading-normal"
        alt={props.alt}
      />
    </a>
  );
}
