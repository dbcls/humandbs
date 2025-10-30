import { Card } from "@/components/Card";

export function FallbackDetailsCard() {
  return (
    <Card
      className="flex h-full flex-1 flex-col"
      containerClassName="flex flex-col flex-1"
      captionSize={"sm"}
      caption={
        <span className="flex h-9 items-center gap-5">
          <span>Details</span>
        </span>
      }
    />
  );
}
