import { Button } from "@/components/ui/button";
import { Input } from "@/components/Input";
import { SkeletonLoading } from "@/components/Skeleton";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useCopyToClipboard } from "@/hooks/useCopyToClipboard";
import { cn } from "@/lib/utils";
import {
  $deleteAsset,
  $uploadAsset,
  listAssetsQueryOptions,
} from "@/serverFunctions/assets";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  CopyIcon,
  PanelLeftClose,
  PanelRight,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { Suspense, useMemo, useState } from "react";

export function AssetsPanel() {
  const [assetsOpen, setAssetsOpen] = useState(false);

  return (
    <div
      className={cn(
        "relative flex min-h-0 w-12 flex-col rounded-sm bg-white transition-all",
        {
          "w-cms-assets-panel": assetsOpen,
        }
      )}
    >
      <Button
        onClick={() => setAssetsOpen((prev) => !prev)}
        className={cn("flex gap-2 text-black", { "flex-col": !assetsOpen })}
        variant={"plain"}
        size={"slim"}
      >
        {assetsOpen ? <PanelLeftClose /> : <PanelRight />}

        <Label
          className={cn("origin-left", {
            "translate-x-8 -translate-y-2 rotate-90": !assetsOpen,
          })}
        >
          Assets
        </Label>
      </Button>
      {assetsOpen ? (
        <Suspense fallback={<SkeletonLoading />}>
          <Assets />
        </Suspense>
      ) : null}
    </div>
  );
}

function Assets() {
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(listAssetsQueryOptions());

  const [filter, setFilter] = useState("");

  const filteredAssets = useMemo(() => {
    if (!data) return [];
    if (!filter) return data;

    return data.filter(
      (asset) =>
        asset.name.includes(filter) || asset.description.includes(filter)
    );
  }, [data, filter]);

  const [addingNewAsset, setAddingNewAsset] = useState(false);
  const [assetFile, setAssetFile] = useState<File>();
  const [newAssetName, setNewAssetName] = useState("");

  function handleChangeFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAssetFile(file);
    setNewAssetName(file.name);
  }

  const { mutate } = useMutation({
    mutationFn: $uploadAsset,
    onSuccess: () => {
      queryClient.invalidateQueries(listAssetsQueryOptions());
    },
  });

  const { mutate: deleteAsset } = useMutation({
    mutationFn: (id: string) => $deleteAsset({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries(listAssetsQueryOptions());
    },
  });

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const fd = new FormData(e.target as HTMLFormElement);

    mutate({ data: fd });

    setAssetFile(undefined);
    setAddingNewAsset(false);
  }

  const [, copy] = useCopyToClipboard();

  return (
    <section className="flex flex-1 flex-col gap-2 p-4">
      <Button
        variant={"toggle"}
        onClick={() => setAddingNewAsset(!addingNewAsset)}
      >
        {addingNewAsset ? (
          "Cancel"
        ) : (
          <>
            <PlusIcon className="mr-2 inline size-4" /> Add new asset
          </>
        )}
      </Button>
      {addingNewAsset ? (
        <form onSubmit={onSubmit} className="space-y-1">
          <Input name="file" type="file" onChange={handleChangeFile} />
          <Input
            name="name"
            placeholder="Name"
            value={newAssetName}
            onChange={(e) => setNewAssetName(e.target.value)}
          />
          <Input name="description" placeholder="Description" />
          <Button
            disabled={!assetFile || !newAssetName}
            type="submit"
            className="ml-auto"
          >
            <UploadIcon className="mr-2 inline size-4" />
            Upload
          </Button>
        </form>
      ) : null}
      <Label>
        <span className="text-sm font-normal whitespace-nowrap">
          Search filter
        </span>
        <Input type="text" onChange={(e) => setFilter(e.target.value)} />
      </Label>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Table className="max-h-full overflow-y-auto">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Preview</TableHead>
              <TableHead className="w-[100px]">Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Url</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredAssets.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <img src={row.url} alt={row.name} />
                </TableCell>
                <TableCell>{row.name}</TableCell>
                <TableCell>{row.mimeType}</TableCell>
                <TableCell>
                  <Button
                    variant={"cms-table-action"}
                    className="text-black"
                    onClick={() => copy(row.url)}
                  >
                    <CopyIcon className="size-4" />
                  </Button>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    onClick={() => deleteAsset(row.id)}
                    variant={"cms-table-action"}
                  >
                    <Trash2Icon className="text-accent size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}
