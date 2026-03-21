import { Component, ReactNode } from 'react';
import { Button, Result } from 'antd';

interface Props { children: ReactNode; }
interface State { hasError: boolean; message: string; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="Đã xảy ra lỗi"
          subTitle={this.state.message}
          extra={
            <Button type="primary" onClick={() => this.setState({ hasError: false, message: '' })}>
              Thử lại
            </Button>
          }
        />
      );
    }
    return this.props.children;
  }
}
