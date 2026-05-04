import React, { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { Textarea } from './Textarea';

describe('Textarea Component', () => {
  it('renders correctly without optional props', () => {
    render(<Textarea placeholder="Enter text" />);
    const textareaElement = screen.getByPlaceholderText('Enter text');
    expect(textareaElement).toBeInTheDocument();
  });

  it('renders with a label and links it to the textarea', () => {
    render(<Textarea label="Description" id="desc-input" />);
    const labelElement = screen.getByText('Description');
    const textareaElement = screen.getByLabelText('Description');

    expect(labelElement).toBeInTheDocument();
    expect(textareaElement).toHaveAttribute('id', 'desc-input');
  });

  it('generates an id automatically if not provided, linking label', () => {
    render(<Textarea label="Auto ID" />);
    const textareaElement = screen.getByLabelText('Auto ID');
    expect(textareaElement).toBeInTheDocument();
    expect(textareaElement).toHaveAttribute('id');
  });

  it('displays an error message and sets aria-invalid', () => {
    const errorMessage = 'This field is required';
    render(<Textarea error={errorMessage} />);

    const textareaElement = screen.getByRole('textbox');
    const errorElement = screen.getByText(errorMessage);

    expect(errorElement).toBeInTheDocument();
    expect(textareaElement).toHaveAttribute('aria-invalid', 'true');
    expect(textareaElement).toHaveAttribute('aria-describedby', errorElement.id);
  });

  it('applies the fullWidth class when fullWidth prop is true', () => {
    const { container } = render(<Textarea fullWidth />);
    // Note: We're checking the container div which gets the fullWidth class
    expect(container.firstChild).toHaveClass(/fullWidth/);
  });

  it('passes standard textarea attributes to the input element', () => {
    render(<Textarea disabled rows={5} maxLength={100} />);
    const textareaElement = screen.getByRole('textbox');

    expect(textareaElement).toBeDisabled();
    expect(textareaElement).toHaveAttribute('rows', '5');
    expect(textareaElement).toHaveAttribute('maxLength', '100');
  });

  it('forwards the ref correctly', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} />);

    expect(ref.current).toBeInstanceOf(HTMLTextAreaElement);
  });
});