import { Component, type ReactNode } from "react";

import styles from "./ErrorBoundary.module.css";

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error: Error): ErrorBoundaryState {
        return { error };
    }

    render() {
        if (this.state.error) {
            return (
                <div role="alert" className={styles.alert}>
                    <p>Something went wrong in the editor.</p>
                    <pre>{this.state.error.message}</pre>
                </div>
            );
        }

        return this.props.children;
    }
}
