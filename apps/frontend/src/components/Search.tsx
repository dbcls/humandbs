import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";
import { Button } from "./ui/button";

export function Search() {
  return (
    <Button variant="plain" className="flex size-10 items-center justify-center rounded-full p-0" asChild>
      <Link to="/{-$lang}/research">
        <SearchIcon className="text-secondary size-6" />
      </Link>
    </Button>
  );
}
