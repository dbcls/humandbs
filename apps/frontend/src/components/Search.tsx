import { Link } from "@tanstack/react-router";
import { SearchIcon } from "lucide-react";

export function Search() {
  return (
    <Link to="/{-$lang}/research">
      <SearchIcon className="text-secondary mr-2" size={24} />
    </Link>
  );
}
