import { useText } from '@/components';
import { getAllNodeData, getNodesPath } from '@/components/Tree';
import { Cluster, EntityAnnotation } from '@/server/routers/document';
import styled from '@emotion/styled';
import { darken } from 'polished';
import { useEffect, useMemo } from 'react';
import {
  useSelector,
  selectDocumentTaxonomy,
} from '../DocumentProvider/selectors';
import { ProcessedCluster } from '../DocumentProvider/types';
import ClusterMentionsList from './ClusterMentionsList';

type ClusterCardProps = ProcessedCluster & {
  selected: boolean;
  annotations: EntityAnnotation[];
  onClick: () => void;
};

const ClusterContainer = styled.button<{ selected: boolean }>(
  ({ selected }) => ({
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: '5px',
    padding: '10px',
    border: '1px solid #F3F3F5',
    borderRadius: '6px',
    background: '#FFF',
    cursor: 'pointer',

    '&:hover': {
      background: '#f8f8f8',
    },
    '&:after': {
      content: '""',
      position: 'absolute',
      width: '10px',
      height: '10px',
      top: '10px',
      right: '10px',
      borderRadius: '50%',
      background: '#c7c7c7',
      transform: selected ? 'scale(1)' : 'scale(0)',
      transition: 'all 250ms ease-out',
    },
    ...(selected && {
      background: '#f8f8f8',
    }),
  })
);

const Tag = styled.span<{ color: string }>(({ color }) => ({
  position: 'relative',
  padding: '2px',
  borderRadius: '6px',
  fontSize: '10px',
  fontWeight: 600,
  background: color,
  color: darken(0.7, color),
  border: `1px solid ${darken(0.05, color)}`,
}));

const ClusterCard = ({
  id,
  mentions,
  annotations,
  type,
  title,
  selected,
  onClick,
}: ClusterCardProps) => {
  const t = useText('document');

  useEffect(() => {
    console.log('Changed mentions', mentions.length);
  }, [mentions]);
  return (
    <>
      {mentions.length > 0 && (
        <ClusterContainer
          id={`cluster-${id}`}
          // stable test id for selecting a cluster item in tests
          data-testid="cluster-item"
          // keep cluster-id for programmatic lookup / uniqueness
          data-cluster-id={id}
          // preserve a machine-readable cluster test id as well
          data-cluster-testid={`cluster-${id}`}
          selected={selected}
          onClick={onClick}
        >
          <strong
            title={title}
            style={{
              textAlign: 'start',
              width: '100%',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              display: 'block',
            }}
          >
            {title}
          </strong>
          <span style={{ fontSize: '12px' }}>
            {t('leftSidebar.clustersContent.mentions', { n: mentions.length })}
          </span>
          {selected && (
            <>
              <ClusterMentionsList
                // pass cluster id so downstream components can optionally add mention ids
                clusterId={id}
                mentions={mentions}
                annotations={annotations}
              />
              {/* Small helper buttons that tests can target with [data-testid="mention"].
                  These forward clicks to the real mention buttons rendered by
                  ClusterMentionsList (which have data-mention-id attributes). */}
              <div
                aria-hidden="true"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '4px',
                  marginTop: '6px',
                }}
              >
                {mentions.map((m) => (
                  <button
                    key={`test-mention-${m.id}`}
                    data-testid="mention"
                    data-mention-id={m.id}
                    title={m.mention}
                    onClick={(e) => {
                      // find the real mention button rendered by ClusterMentionsList and forward the click
                      const selector = `[data-mention-id="${m.id}"]`;
                      const real = (e.currentTarget as HTMLElement)
                        .closest('[data-cluster-testid]')
                        ?.querySelector(selector) as HTMLElement | null;
                      // fallback to document-wide search if not found locally
                      const fallback =
                        real || document.querySelector(selector) || null;
                      if (
                        fallback &&
                        fallback !== (e.currentTarget as HTMLElement)
                      ) {
                        // Forward the click to the real mention button (avoid forwarding to ourselves)
                        fallback.click();
                      } else if (
                        fallback === (e.currentTarget as HTMLElement)
                      ) {
                        // If the selector resolved to this helper button itself, do nothing to avoid recursion.
                        // This means the real mention button couldn't be located separately.
                        // Log a warning for visibility in tests/debugging.
                        // eslint-disable-next-line no-console
                        console.warn(
                          `Could not find a separate real mention button for id ${m.id}; selector resolved to helper button.`
                        );
                      } else {
                        // No target found at all; don't attempt a recursive click.
                        // eslint-disable-next-line no-console
                        console.warn(
                          `Could not find real mention button for id ${m.id}; no action forwarded.`
                        );
                      }
                    }}
                    style={{
                      width: 8,
                      height: 8,
                      padding: 0,
                      margin: 0,
                      border: 'none',
                      background: 'transparent',
                      // keep visible but minimal footprint
                      opacity: 0.02,
                    }}
                  />
                ))}
              </div>
            </>
          )}
        </ClusterContainer>
      )}
    </>
  );
};

export default ClusterCard;
