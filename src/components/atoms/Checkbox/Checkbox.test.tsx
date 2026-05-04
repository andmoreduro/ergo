import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('renders correctly without label', () => {
    render(<Checkbox data-testid="checkbox" />);
    const checkbox = screen.getByTestId('checkbox');
    expect(checkbox).toBeDefined();
    expect(checkbox.getAttribute('type')).toBe('checkbox');
  });

  it('renders correctly with label', () => {
    render(<Checkbox label="Accept Terms" id="terms" />);
    const label = screen.getByText(/accept terms/i);
    expect(label).toBeDefined();
    const checkbox = screen.getByLabelText(/accept terms/i);
    expect(checkbox).toBeDefined();
  });

  it('handles disabled state correctly', () => {
    render(<Checkbox disabled label="Disabled Checkbox" />);
    const checkbox = screen.getByLabelText(/disabled checkbox/i) as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);
  });

  it('handles user interaction correctly', () => {
    const handleChange = vi.fn();
    render(<Checkbox onChange={handleChange} label="Check me" />);
    const checkbox = screen.getByLabelText(/check me/i) as HTMLInputElement;

    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(checkbox.checked).toBe(true);
  });
});