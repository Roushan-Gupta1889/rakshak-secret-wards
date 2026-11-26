import * as React from "react";
import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";

export function MobileDrawer({
  open,
  onOpenChange,
  title,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/70 backdrop-blur-[2px]" />
        <Dialog.Popup className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-slate-800 bg-[#090F1D] p-4 shadow-xl focus:outline-none">
          <div className="mb-4 flex items-center justify-between border-b border-slate-800/80 pb-3">
            <Dialog.Title className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              {title}
            </Dialog.Title>
            <Dialog.Close className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-100">
              <X className="h-4 w-4" />
              <span className="sr-only">Close navigation</span>
            </Dialog.Close>
          </div>
          <div className="flex-1 overflow-y-auto">{children}</div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
