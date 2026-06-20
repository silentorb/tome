import { useState } from "react";
import { MoveRelationshipDialog } from "./MoveRelationshipDialog";
import { PageActionsMenu } from "./PageActionsMenu";
import type { EditorApi } from "../api/client";

export interface TableRowMoveConfig {
  api: EditorApi;
  excludedIds: readonly string[];
  allowedTypeIds?: readonly string[];
  onMove: (selectedId: string) => Promise<void>;
  onMoved?: () => void;
}

interface TableRowActionsCellProps {
  recordTitle: string;
  onArchive: () => Promise<void>;
  onRemove: () => Promise<void>;
  onDelete: () => Promise<void>;
  move?: TableRowMoveConfig;
  archiveHubTitle?: string;
}

export function TableRowActionsCell({
  recordTitle,
  onArchive,
  onRemove,
  onDelete,
  move,
  archiveHubTitle,
}: TableRowActionsCellProps) {
  const [moveOpen, setMoveOpen] = useState(false);

  return (
    <>
      <PageActionsMenu
        recordTitle={recordTitle}
        trigger="vertical-dots"
        menuAlign="left"
        menuPlacement="portal"
        archiveHubTitle={archiveHubTitle}
        onArchive={onArchive}
        onRemove={onRemove}
        onDelete={onDelete}
        onMove={move ? () => setMoveOpen(true) : undefined}
      />
      {move ? (
        <MoveRelationshipDialog
          api={move.api}
          open={moveOpen}
          recordTitle={recordTitle}
          allowedTypeIds={move.allowedTypeIds}
          excludedIds={move.excludedIds}
          onClose={() => setMoveOpen(false)}
          onMove={move.onMove}
          onMoved={move.onMoved}
        />
      ) : null}
    </>
  );
}
