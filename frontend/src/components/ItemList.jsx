import { Icon } from './Icon'
import { CATEGORIES, expiryStatus, formatDate, stockStatus } from '../lib/format'

function Badge({ tone, children }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    rose: 'bg-rose-50 text-rose-800 ring-rose-200',
    sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  }
  return <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ${tones[tone]}`}>{children}</span>
}

function ItemRow({ item, onAdjust, onQuick, onEdit, onDelete }) {
  const cat = CATEGORIES[item.category] ?? CATEGORIES.other
  const stock = stockStatus(item)
  const expiry = expiryStatus(item)
  return (
    <li className="group flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3.5 transition-colors hover:bg-stone-50/80 sm:flex-nowrap sm:px-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${cat.tile}`} title={cat.label}>
          <Icon name={cat.icon} size={20} />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-medium text-stone-900">{item.name}</p>
            {stock === 'low' && <Badge tone="amber">Low stock</Badge>}
            {stock === 'negative' && <Badge tone="rose">Negative: recount</Badge>}
            {expiry?.kind === 'expired' && <Badge tone="rose">Expired</Badge>}
            {expiry?.kind === 'soon' && <Badge tone="amber">Expires in {expiry.days} d</Badge>}
            {item._pending && (
              <Badge tone="sky">
                <Icon name="clock" size={11} /> Not synced
              </Badge>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-stone-500">
            {item.location && (
              <span className="inline-flex items-center gap-1">
                <Icon name="marker" size={12} /> {item.location}
              </span>
            )}
            {item.expiry_date && (
              <span className="inline-flex items-center gap-1">
                <Icon name="calendar" size={12} /> {formatDate(item.expiry_date)}
              </span>
            )}
            {item.min_stock > 0 && <span>Reorder at {item.min_stock}</span>}
          </p>
        </div>
      </div>

      <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <div className="flex items-center rounded-xl bg-stone-100 p-1 ring-1 ring-stone-200/70">
          <button type="button" className="icon-btn size-8 hover:bg-white" onClick={() => onQuick(item, -1)} aria-label={`Dispense one ${item.name}`}>
            <Icon name="minus" size={14} />
          </button>
          <button
            type="button"
            onClick={() => onAdjust(item)}
            className={`min-w-[5.5rem] rounded-lg px-2 py-1 text-center transition hover:bg-white ${stock === 'negative' ? 'text-rose-700' : stock === 'low' ? 'text-amber-800' : ''}`}
            aria-label={`${item.quantity} ${item.unit}. Receive or dispense ${item.name}`}
          >
            <span className="block text-base font-semibold leading-tight tabular-nums">{item.quantity.toLocaleString()}</span>
            <span className="block text-[11px] leading-tight text-stone-500">{item.unit}</span>
          </button>
          <button type="button" className="icon-btn size-8 hover:bg-white" onClick={() => onQuick(item, 1)} aria-label={`Receive one ${item.name}`}>
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="flex items-center">
          <button type="button" className="icon-btn" onClick={() => onEdit(item)} aria-label={`Edit ${item.name}`}>
            <Icon name="edit" size={17} />
          </button>
          <button type="button" className="icon-btn hover:bg-rose-50 hover:text-rose-700" onClick={() => onDelete(item)} aria-label={`Delete ${item.name}`}>
            <Icon name="trash" size={17} />
          </button>
        </div>
      </div>
    </li>
  )
}

export function ItemList({ items, totalCount, onAdd, ...handlers }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-stone-100 text-stone-400">
          <Icon name="box" size={28} />
        </span>
        <p className="mt-4 font-medium text-stone-900">{totalCount === 0 ? 'No stock recorded yet' : 'Nothing matches'}</p>
        <p className="mt-1 max-w-xs text-sm text-stone-500">
          {totalCount === 0
            ? 'Add your first item. It is saved on this device right away, even with no connection.'
            : 'Try another search or category.'}
        </p>
        {totalCount === 0 && (
          <button type="button" className="btn-primary mt-5" onClick={onAdd}>
            <Icon name="plus" size={16} /> Add item
          </button>
        )}
      </div>
    )
  }
  return (
    <ul className="divide-y divide-stone-100">
      {items.map((item) => (
        <ItemRow key={item.id} item={item} {...handlers} />
      ))}
    </ul>
  )
}
