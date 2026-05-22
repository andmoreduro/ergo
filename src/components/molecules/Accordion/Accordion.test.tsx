import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import '@testing-library/jest-dom';
import { Accordion } from './Accordion';

describe('Accordion Component', () => {
  const title = 'Test Accordion Title';
  const content = 'This is the accordion content';

  it('renders the title correctly', () => {
    render(<Accordion title={title}><div>{content}</div></Accordion>);
    expect(screen.getByText(title)).toBeInTheDocument();
  });

  it('is closed by default and does not show content', () => {
    render(<Accordion title={title}><div>{content}</div></Accordion>);

    // Content should not be in the document
    expect(screen.queryByText(content)).not.toBeInTheDocument();

    // Button should have aria-expanded false
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('is open by default when defaultOpen prop is true', () => {
    render(
      <Accordion title={title} defaultOpen>
        <div>{content}</div>
      </Accordion>
    );

    // Content should be visible
    expect(screen.getByText(content)).toBeInTheDocument();

    // Button should have aria-expanded true
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  it('toggles content visibility when the header is clicked', () => {
    render(<Accordion title={title}><div>{content}</div></Accordion>);
    const button = screen.getByRole('button');

    // Initially closed
    expect(screen.queryByText(content)).not.toBeInTheDocument();

    // Click to open
    fireEvent.click(button);
    expect(screen.getByText(content)).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');

    // Click to close
    fireEvent.click(button);
    expect(screen.queryByText(content)).not.toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not clip content height with container overflow', () => {
    const css = readFileSync(
      'src/components/molecules/Accordion/Accordion.module.css',
      'utf8',
    );

    expect(css).not.toMatch(/\.container\s*\{[^}]*overflow:\s*hidden/s);
    expect(css).toMatch(/\.header\s*\{[^}]*border-radius:/s);
    expect(css).toMatch(/\.content\s*\{[^}]*border-radius:/s);
  });
});
