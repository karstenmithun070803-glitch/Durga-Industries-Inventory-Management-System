"use client";

import { useState, useEffect, useMemo } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOption {
  value: string;
  label: string;
  displayLabel?: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  /** Called when the popover opens or closes — used by TransactionGrid to track open combobox cell */
  onOpenChange?: (open: boolean) => void;
  /** data-grid-row attr forwarded to the trigger button (for grid keyboard nav) */
  gridRow?: number;
  /** data-grid-col attr forwarded to the trigger button (for grid keyboard nav) */
  gridCol?: number;
  /** Called on keydown when combobox is closed — used by TransactionGrid for grid arrow navigation */
  onGridKeyDown?: (e: React.KeyboardEvent) => void;
  /** When true, pressing ↓ on a closed combobox opens it (use for identifier dropdowns at top of screens) */
  openOnArrowDown?: boolean;
  /** Max options rendered in the DOM at once — prevents layout thrashing with large lists (default 150) */
  maxDisplay?: number;
}

export function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  className,
  onOpenChange: onOpenChangeProp,
  gridRow,
  gridCol,
  onGridKeyDown,
  openOnArrowDown = false,
  maxDisplay = 150,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);

  // Limit DOM nodes: filter manually then slice, so cmdk never renders >maxDisplay items.
  // When search is empty, always ensure the selected item appears even if outside the slice.
  const displayOptions = useMemo(() => {
    if (!search) {
      const sliced = options.slice(0, maxDisplay);
      if (value && !sliced.find((o) => o.value === value)) {
        const sel = options.find((o) => o.value === value);
        if (sel) return [...sliced, sel];
      }
      return sliced;
    }
    const q = search.toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q)).slice(0, maxDisplay);
  }, [options, search, value, maxDisplay]);

  const showOverflowHint = options.length > maxDisplay && !search;

  useEffect(() => {
    if (!value) setSearch("");
  }, [value]);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    onOpenChangeProp?.(next);
  }

  function handleTriggerKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      // ↓ opens dropdown (identifier dropdowns only)
      if (e.key === "ArrowDown" && openOnArrowDown) {
        e.preventDefault();
        e.stopPropagation();
        handleOpenChange(true);
        return;
      }
      if (e.key === "Enter") {
        // Empty cell (nothing picked yet) or an identifier dropdown → open to pick.
        if (!value || openOnArrowDown) {
          e.preventDefault();
          e.stopPropagation();
          handleOpenChange(true);
          return;
        }
        // Already filled → let the grid advance the Enter chain (don't reopen).
        onGridKeyDown?.(e);
        return;
      }
      // Type-to-open: a printable character opens the dropdown seeded with it, so a
      // filled cell can be changed by just starting to type (ArrowDown stays row-nav).
      if (e.key.length === 1 && e.key !== " " && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        setSearch(e.key);
        handleOpenChange(true);
        return;
      }
      // Delegate grid arrow keys to the parent grid hook when combobox is closed
      onGridKeyDown?.(e);
    } else {
      // Popup is open — forward navigation keys to CommandInput so cmdk handles them
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        const input = document.querySelector<HTMLInputElement>("[cmdk-root] input");
        if (input) {
          input.focus();
          input.dispatchEvent(new KeyboardEvent("keydown", { key: e.key, bubbles: true, cancelable: true }));
        }
      }
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        role="combobox"
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between h-9 font-normal",
          // System B (cursor location): a dropdown-with-data lights up in the neutral
          // rowhover shade when hovered or open — deliberately NOT blue (blue = option-selection only).
          "hover:bg-rowhover hover:text-slate-900 aria-expanded:bg-rowhover aria-expanded:text-slate-900",
          className
        )}
        onKeyDown={handleTriggerKeyDown}
        data-grid-row={gridRow}
        data-grid-col={gridCol}
      >
        <span className={cn("truncate", !selected && "text-muted-foreground")}>
          {selected ? (selected.displayLabel ?? selected.label) : placeholder}
        </span>
        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput autoFocus placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {value && (
                <CommandItem
                  value="__clear__"
                  onSelect={() => { onChange(""); handleOpenChange(false); }}
                  className="text-muted-foreground text-xs"
                >
                  Clear selection
                </CommandItem>
              )}
              {displayOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.label}
                  onSelect={() => { onChange(option.value); handleOpenChange(false); }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  {option.label}
                </CommandItem>
              ))}
            </CommandGroup>
            {showOverflowHint && (
              <p className="px-3 py-2 text-xs text-center text-muted-foreground border-t border-slate-100">
                Showing {maxDisplay} of {options.length} — type to search
              </p>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
