import { type HTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react'
import { clsx } from 'clsx'

interface TableProps extends HTMLAttributes<HTMLTableElement> {}

export function Table({ className, ...props }: TableProps) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        className={clsx('w-full caption-bottom text-sm', className)}
        {...props}
      />
    </div>
  )
}

interface TableHeaderProps extends HTMLAttributes<HTMLTableSectionElement> {}

export function TableHeader({ className, ...props }: TableHeaderProps) {
  return <thead className={clsx('[&_tr]:border-b', className)} {...props} />
}

interface TableBodyProps extends HTMLAttributes<HTMLTableSectionElement> {}

export function TableBody({ className, ...props }: TableBodyProps) {
  return <tbody className={clsx('[&_tr:last-child]:border-0', className)} {...props} />
}

interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {}

export function TableRow({ className, ...props }: TableRowProps) {
  return (
    <tr
      className={clsx(
        'border-b transition-colors hover:bg-gray-50/50',
        className
      )}
      {...props}
    />
  )
}

interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {}

export function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <th
      className={clsx(
        'h-12 px-4 text-left align-middle font-medium text-gray-500',
        '[&:has([role=checkbox])]:pr-0',
        className
      )}
      {...props}
    />
  )
}

interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {}

export function TableCell({ className, ...props }: TableCellProps) {
  return (
    <td
      className={clsx('p-4 align-middle [&:has([role=checkbox])]:pr-0', className)}
      {...props}
    />
  )
}
