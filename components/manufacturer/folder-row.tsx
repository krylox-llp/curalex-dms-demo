"use client";

import Link from "next/link";
import { useState } from "react";
import { DeleteDialog } from "@/components/manufacturer/delete-dialog";
import { FolderIcon } from "@/components/manufacturer/icons";
import { RowMenu } from "@/components/manufacturer/row-menu";
import type { Folder } from "@/lib/documents-shared";

export function FolderRow({ folder }: { folder: Folder }) {
  const [deleting, setDeleting] = useState(false);
  return (
    <tr className="hover:bg-contrast-5">
      <td />
      <td colSpan={4}>
        <Link href={`/manufacturer?folder=${folder.id}`} className="flex items-center gap-2.5 font-medium text-header hover:text-primary-text">
          <FolderIcon className="size-4 shrink-0 text-primary" />
          {folder.name}
        </Link>
      </td>
      <td className="text-right">
        <RowMenu label={`Actions for folder ${folder.name}`} items={[{ label: "Delete folder", danger: true, onSelect: () => setDeleting(true) }]} />
        {deleting && (
          <DeleteDialog target={{ kind: "folder", id: folder.id }} label={folder.name} onClose={() => setDeleting(false)} />
        )}
      </td>
    </tr>
  );
}
