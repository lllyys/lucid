// WI-3 — the add/edit custom-provider form (#10, design Section B): validation + add/save/cancel/test.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@/i18n'
import { CustomProviderForm } from './CustomProviderForm'

const noop = () => {}
// uniqueLabel mirroring the store predicate: nonempty + not in `taken` (case-insensitive, trimmed).
const uniqOf = (taken: string[]) => (label: string) =>
  label.trim() !== '' && !taken.some((l) => l.trim().toLowerCase() === label.trim().toLowerCase())

beforeEach(() => vi.clearAllMocks())

describe('CustomProviderForm (add)', () => {
  const renderAdd = (props: Partial<React.ComponentProps<typeof CustomProviderForm>> = {}) =>
    render(
      <CustomProviderForm
        mode="add"
        uniqueLabel={uniqOf([])}
        onSubmit={noop}
        onCancel={noop}
        onTest={noop}
        testResult={{ status: 'idle' }}
        keyValue=""
        onSetKey={noop}
        {...props}
      />,
    )

  it('disables Add until label is unique-nonempty, URL parses, and model is set', async () => {
    const user = userEvent.setup()
    renderAdd()
    const add = screen.getByRole('button', { name: /add provider/i })
    expect(add).toBeDisabled()
    await user.type(screen.getByRole('textbox', { name: /label/i }), 'Together')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'https://api.together.xyz/v1')
    await user.type(screen.getByRole('textbox', { name: /^model$/i }), 'Qwen2.5-72B')
    expect(add).toBeEnabled()
  })

  it('shows a duplicate-label error and keeps Add disabled', async () => {
    const user = userEvent.setup()
    renderAdd({ uniqueLabel: uniqOf(['Together AI']) })
    await user.type(screen.getByRole('textbox', { name: /label/i }), 'together ai') // case-insensitive dupe
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'https://h/v1')
    await user.type(screen.getByRole('textbox', { name: /^model$/i }), 'm')
    expect(screen.getByText(/already exists/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add provider/i })).toBeDisabled()
  })

  it('shows a bad-URL error for a scheme-less base URL and keeps Add disabled', async () => {
    const user = userEvent.setup()
    renderAdd()
    await user.type(screen.getByRole('textbox', { name: /label/i }), 'Together')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'api.together.xyz')
    await user.type(screen.getByRole('textbox', { name: /^model$/i }), 'm')
    expect(screen.getByText(/needs a scheme/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add provider/i })).toBeDisabled()
  })

  it('submits the trimmed fields on Add', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    renderAdd({ onSubmit })
    await user.type(screen.getByRole('textbox', { name: /label/i }), '  Together  ')
    await user.type(screen.getByRole('textbox', { name: /base url/i }), '  https://api.together.xyz/v1  ')
    await user.type(screen.getByRole('textbox', { name: /^model$/i }), '  Qwen2.5-72B  ')
    await user.click(screen.getByRole('button', { name: /add provider/i }))
    expect(onSubmit).toHaveBeenCalledWith({
      label: 'Together',
      baseUrl: 'https://api.together.xyz/v1',
      model: 'Qwen2.5-72B',
    })
  })

  it('gates add-mode Test on FULL validity (it materializes the custom — a valid URL alone is not enough)', async () => {
    const user = userEvent.setup()
    const onTest = vi.fn()
    renderAdd({ onTest })
    const testBtn = screen.getByRole('button', { name: /test connection/i })
    expect(testBtn).toBeDisabled() // nothing entered
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'https://h/v1')
    expect(testBtn).toBeDisabled() // URL valid but no label/model → still disabled (Test would create a real row)
    await user.type(screen.getByRole('textbox', { name: /label/i }), 'Together')
    await user.type(screen.getByRole('textbox', { name: /^model$/i }), 'm')
    expect(testBtn).toBeEnabled() // full form valid → Test allowed
    await user.click(testBtn)
    expect(onTest).toHaveBeenCalledOnce()
  })

  it('keeps add-mode Test disabled on a duplicate label (no second custom can be minted) — Gate-4 #10 WI-3', async () => {
    const user = userEvent.setup()
    const onTest = vi.fn()
    renderAdd({ uniqueLabel: uniqOf(['Together AI']), onTest })
    await user.type(screen.getByRole('textbox', { name: /label/i }), 'Together AI') // duplicate
    await user.type(screen.getByRole('textbox', { name: /base url/i }), 'https://h/v1')
    await user.type(screen.getByRole('textbox', { name: /^model$/i }), 'm')
    // Test materializes the custom, so a non-unique label must keep it disabled → no row minted.
    expect(screen.getByRole('button', { name: /test connection/i })).toBeDisabled()
    expect(onTest).not.toHaveBeenCalled()
  })

  it('Cancel invokes onCancel', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    renderAdd({ onCancel })
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('Show toggles the key field between password and text', async () => {
    const user = userEvent.setup()
    renderAdd()
    const keyInput = screen.getByLabelText(/api key/i)
    expect(keyInput).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: /show/i }))
    expect(keyInput).toHaveAttribute('type', 'text')
  })
})

describe('CustomProviderForm (edit)', () => {
  it('prefills the existing fields and the Save button labels for edit', () => {
    render(
      <CustomProviderForm
        mode="edit"
        editId="c1"
        initial={{ label: 'Office', baseUrl: 'https://gw/v1', model: 'gpt-4o-mini' }}
        uniqueLabel={uniqOf([])}
        onSubmit={noop}
        onCancel={noop}
        onTest={noop}
        testResult={{ status: 'idle' }}
        keyValue=""
        onSetKey={noop}
      />,
    )
    expect(screen.getByRole('textbox', { name: /label/i })).toHaveValue('Office')
    expect(screen.getByRole('textbox', { name: /base url/i })).toHaveValue('https://gw/v1')
    expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument()
  })

  it('excludes the edited row from the duplicate check (its own label stays valid)', () => {
    render(
      <CustomProviderForm
        mode="edit"
        editId="c1"
        initial={{ label: 'Office', baseUrl: 'https://gw/v1', model: 'gpt-4o-mini' }}
        uniqueLabel={(label, exceptId) => label.trim() !== '' && !(label === 'Office' && exceptId !== 'c1')}
        onSubmit={noop}
        onCancel={noop}
        onTest={noop}
        testResult={{ status: 'idle' }}
        keyValue=""
        onSetKey={noop}
      />,
    )
    // Its own unchanged label must not error, and Save is enabled.
    expect(screen.queryByText(/already exists/i)).toBeNull()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeEnabled()
  })
})
