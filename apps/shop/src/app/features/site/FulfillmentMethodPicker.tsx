import type { LocalFulfillmentQuote } from './localFulfillment';
import { regionProps } from './storefrontRegions';

export type FulfillmentSelection = { method: 'shipping' | 'pickup' | 'local_delivery'; optionId: string };
type ShippingChoice = { id: string; name: string; price: number; deliveryDays?: string; carrierEstimate?: boolean; durationTerms?: string };
type Words = { group?: string; shipping: string; pickup: string; local_delivery: string; review: string; free: string; unavailable?: string; addressPrompt?: string; loading?: string; instructions?: string; hours?: string; estimate?: string; carrierTransit?: string; carrierUnavailable?: string; deliveryDays?: string };
const transitDays = (c: ShippingChoice) => { const n = Number(c.deliveryDays); return c.deliveryDays && Number.isFinite(n) ? n : Infinity; };
/** Best options first: cheapest, then quickest; an option with no delivery estimate goes after one that has it. */
export const bestFirst = (a: ShippingChoice, b: ShippingChoice) => (a.price - b.price) || (transitDays(a) - transitDays(b)) || 0;
export function FulfillmentMethodPicker({ method, optionId, onSelect, shippingQuotes, localQuotes, words, formatPrice, loading = false, availableMethods = ['shipping', 'pickup', 'local_delivery'] }: {
  method: FulfillmentSelection['method']; optionId: string; onSelect: (value: FulfillmentSelection) => void;
  shippingQuotes: ShippingChoice[]; localQuotes: LocalFulfillmentQuote[]; words: Words;
  formatPrice: (amount: number) => string; loading?: boolean; availableMethods?: FulfillmentSelection['method'][];
}) {
  // Pickup sits in the same list as the shipping rates ("Local pickup — Free"), not behind its own button.
  const shippingList = method === 'shipping' || method === 'pickup';
  const choices: any[] = shippingList
    ? [...[...shippingQuotes].sort(bestFirst), ...localQuotes.filter(quote => quote.method === 'pickup')]
    : localQuotes.filter(quote => quote.method === method);
  const tabs = availableMethods.filter(value => value !== 'pickup');
  const activeTab = method === 'pickup' ? 'shipping' : method;
  return <div {...regionProps('checkoutFulfillment')} className="flex flex-col gap-4">
    {tabs.length > 1 && <div className="fm-co-seg" role="group" aria-label={words.group}>
      {tabs.map(value =>
        <button key={value} type="button" data-method={value} aria-pressed={activeTab === value}
          onClick={() => onSelect({ method: value, optionId: '' })}
          className="fm-co-seg-btn fm-co-mono">{words[value]}</button>)}
    </div>}
    {loading && shippingList ? <p className="fm-co-empty" role="status">{words.loading}</p> : choices.length ?
      <div role="radiogroup" aria-label={words.group} className="fm-co-choices">
        {choices.map(choice => <label key={choice.id} className="fm-co-choice">
          <input type="radio" name="fulfillment-option" value={choice.id} checked={optionId === choice.id}
            onChange={() => onSelect({ method: choice.method === 'pickup' ? 'pickup' : shippingList ? 'shipping' : method, optionId: choice.id })} />
          <span className="min-w-0">
            <strong className="fm-co-choice-name">{choice.name}</strong>
            {'address' in choice && choice.address?.street && <span className="fm-co-choice-meta">{[choice.address.street, choice.address.city, [choice.address.state, choice.address.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')}</span>}
            {'hours' in choice && choice.hours && <span className="fm-co-choice-meta">{words.hours} {choice.hours}</span>}
            {'instructions' in choice && choice.instructions && <span className="fm-co-choice-meta whitespace-pre-wrap">{words.instructions} {choice.instructions}</span>}
            {'estimate' in choice && choice.estimate && <span className="fm-co-choice-meta">{words.estimate} {choice.estimate}</span>}
            {!('method' in choice) && (() => {
              const days = (choice as ShippingChoice).deliveryDays;
              const template = (choice as ShippingChoice).carrierEstimate ? words.carrierTransit : words.deliveryDays;
              if (days) return template ? <span className="fm-co-choice-meta" data-delivery-estimate>{template.replace('{days}', days)}</span> : null;
              return (choice as ShippingChoice).carrierEstimate && !(choice as ShippingChoice).durationTerms && words.carrierUnavailable
                ? <span className="fm-co-choice-meta" data-delivery-estimate>{words.carrierUnavailable}</span> : null;
            })()}
            {'durationTerms' in choice && choice.durationTerms && <span className="fm-co-choice-meta">{choice.durationTerms}</span>}
          </span>
          <span className="fm-co-choice-price">{choice.price === 0 ? words.free : formatPrice(choice.price)}</span>
        </label>)}
      </div> : <p className="fm-co-empty">{method !== 'shipping' ? words.addressPrompt || words.unavailable : words.unavailable}</p>}
    {!optionId && <p role="status" className="fm-co-note" style={{ color: 'var(--warning, #b45309)' }}>{words.review}</p>}
  </div>;
}
