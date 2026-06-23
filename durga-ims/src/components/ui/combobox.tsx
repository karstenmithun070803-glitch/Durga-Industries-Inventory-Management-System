"use client";

import { useState, useEffect } from "react";
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
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const selected = options.find((o) => o.value === value);

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
        handleOpenChange(true);
        return;
      }
      // Delegate grid arrow keys to the parent grid hook when combobox is closed
      onGridKeyDown?.(e);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          buttonVariants({ variant: "outline" }),
          "w-full justify-between h-9 font-normal",
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
        <Command>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
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
              {options.map((option) => (
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
