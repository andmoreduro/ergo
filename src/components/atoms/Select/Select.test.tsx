import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { Select } from './Select';

const mockOptions = [
  { value: 'option1', label: 'Option 1' },
  { value: 'option2', label: 'Option 2' },
  { value: 'option3', label: 'Option 3' },
];

describe('Select Component', () => {
  it('renders correctly with options', () => {
    render(<Select options={mockOptions} />);
    const selectElement = screen.getByRole('combobox');
    expect(selectElement).toBeInTheDocument();

    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveValue('option1');
    expect(options[0]).toHaveTextContent('Option 1');
  });

  it('renders with a label and links it to the select', () => {
    render(<Select label="Choose an option" options={mockOptions} id="my-select" />);
    const labelElement = screen.getByText('Choose an option');
    const selectElement = screen.getByLabelText('Choose an option');

    expect(labelElement).toBeInTheDocument();
    expect(selectElement).toHaveAttribute('id', 'my-select');
  });

  it('generates an id automatically if not provided, linking label', () => {
    render(<Select label="Auto ID" options={mockOptions} />);
    const selectElement = screen.getByLabelText('Auto ID');
    expect(selectElement).toBeInTheDocument();
    expect(selectElement).toHaveAttribute('id');
  });

  it('displays an error message and sets aria-invalid', () => {
    const errorMessage = 'Selection is required';
    render(<Select error={errorMessage} options={mockOptions} />);

    const selectElement = screen.getByRole('combobox');
    const errorElement = screen.getByText(errorMessage);

    expect(errorElement).toBeInTheDocument();
    expect(selectElement).toHaveAttribute('aria-invalid', 'true');
    expect(selectElement).toHaveAttribute('aria-describedby', errorElement.id);
  });

  it('applies the fullWidth class when fullWidth prop is true', () => {
    const { container } = render(<Select fullWidth options={mockOptions} />);
    // Checking the container div which gets the fullWidth class
    expect(container.firstChild).toHaveClass(/fullWidth/);
  });

  it('passes standard select attributes to the select element', () => {
    render(<Select disabled required options={mockOptions} />);
    const selectElement = screen.getByRole('combobox');

    expect(selectElement).toBeDisabled();
    expect(selectElement).toBeRequired();
  });

  it('forwards the ref correctly', () => {
    const ref = createRef<HTMLSelectElement>();
    render(<Select ref={ref} options={mockOptions} />);

    expect(ref.current).toBeInstanceOf(HTMLSelectElement);
  });
});