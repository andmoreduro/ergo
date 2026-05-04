import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TextInput } from './TextInput';

describe('TextInput', () => {
  it('renders correctly without label', () => {
    render(<TextInput placeholder="Enter text" />);
    const input = screen.getByPlaceholderText(/enter text/i);
    expect(input).toBeDefined();
  });

  it('renders correctly with label', () => {
    render(<TextInput label="Username" id="username" />);
    const label = screen.getByText(/username/i);
    expect(label).toBeDefined();
    const input = screen.getByLabelText(/username/i);
    expect(input).toBeDefined();
  });

  it('renders correctly with error message', () => {
    render(<TextInput error="Invalid input" />);
    const errorMessage = screen.getByText(/invalid input/i);
    expect(errorMessage).toBeDefined();
    const input = screen.getByRole('textbox');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });

  it('applies fullWidth class correctly', () => {
    render(<TextInput fullWidth placeholder="Full Width" />);
    const input = screen.getByPlaceholderText(/full width/i);
    expect(input.parentElement?.className).toContain('fullWidth');
  });

  it('handles disabled state correctly', () => {
    render(<TextInput disabled label="Disabled Input" />);
    const input = screen.getByRole('textbox', { name: /disabled input/i }) as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });

  it('handles user input correctly', () => {
    const handleChange = vi.fn();
    render(<TextInput onChange={handleChange} placeholder="Type here" />);
    const input = screen.getByPlaceholderText(/type here/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'test value' } });
    expect(handleChange).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('test value');
  });
});