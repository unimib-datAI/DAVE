import { useContext, useMemo } from 'react';
import View from './View';
import { ViewContext } from './ViewContext';
import { Progress } from '@nextui-org/react';
import LoadingOverlay from '@/modules/review/LoadingOverlay';
import { Button } from '@/components';

type ViewProviderProps = {
  viewIndex: number;
  isLoading: boolean;
};

export const useViewIndex = () => {
  const context = useContext(ViewContext);

  if (context === undefined) {
    throw new Error('useViewIndex must be used within a ViewProvider');
  }

  return context.viewIndex;
};

const ViewProvider = ({ viewIndex, isLoading }: ViewProviderProps) => {
  const value = useMemo(() => ({ viewIndex }), [viewIndex]);

  return (
    <ViewContext.Provider value={value}>
      <View />
      {isLoading && (
        <Button
          loading={isLoading}
          className="bg-slate-900 mx-auto"
          style={{ marginBottom: 20 }}
        >
          Loading
        </Button>
      )}
    </ViewContext.Provider>
  );
};

export default ViewProvider;
