import React, { useContext, useEffect, useState } from 'react';
import { ProcessedCluster } from '../DocumentProvider/types';
import { Button } from '@nextui-org/react';
import { Checkbox, Col, Drawer, message, Modal, Row, Select, Tag } from 'antd';
import {
  selectCurrentAnnotationSetName,
  selectDocumentId,
  selectDocumentTaxonomy,
  useSelector,
} from '../DocumentProvider/selectors';
import { getAllNodeData } from '@/components/Tree';
import {
  DndContext,
  DragEndEvent,
  UniqueIdentifier,
  closestCorners,
  DragOverlay,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation } from '@/utils/trpc';
import { DocumentContext } from '../DocumentProvider/DocumentProvider';
import { getClustersGroups, groupBy } from '@/utils/shared';
import { CheckboxChangeEvent } from 'antd/es/checkbox';

interface EditClustersProps {
  onEdit: Function;
  clusterGroups: {
    [key: string]: ProcessedCluster[];
  };
}
interface Item {
  id: string;
  content: string;
  fullText: string;
}

interface Container {
  id: string;
  title: string;
  items: Item[];
}

interface State {
  [key: string]: Container;
}
interface SortableItemProps {
  id: UniqueIdentifier;
  name: string;
  mentionText: string;
  activeItems: Item[];
  selectedItems: Set<string>;
  onCheckboxChange: (id: string) => void;
}

const SortableItem: React.FC<SortableItemProps> = ({
  id,
  name,
  mentionText,
  selectedItems,
  onCheckboxChange,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id });
  const startIndex = mentionText.indexOf(name);
  const endIndex = startIndex + name.length - 1;
  const isSelected = selectedItems.has(id.toString());
  const handleCheckboxChange = (event: CheckboxChangeEvent) => {
    event.stopPropagation();
    onCheckboxChange(id.toString());
  };
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    padding: '10px',
    border: '1px solid #ccc',
    borderRadius: 10,

    marginBottom: '4px',
    backgroundColor: isSelected ? '#d2d2d4' : 'white',
    cursor: 'grab',
    zIndex: transform ? 1 : 'auto',
  };
  const customListeners = {
    ...listeners,
    onPointerDown: (event: React.PointerEvent) => {
      // Prevent drag initiation if the target is the checkbox
      if ((event.target as HTMLElement).tagName !== 'INPUT') {
        if (listeners) listeners.onPointerDown?.(event);
      }
    },
    onClick: (event: React.MouseEvent) => {
      if ((event.target as HTMLElement).tagName !== 'INPUT') {
        if (listeners) listeners.onClick?.(event);
      }
    },
  };
  return (
    <div ref={setNodeRef} style={style} {...attributes} {...customListeners}>
      <Row gutter={15}>
        <Col span={2}>
          <Checkbox
            style={{ zIndex: 10 }}
            checked={isSelected}
            onChange={handleCheckboxChange}
          />
        </Col>
        <Col span={22}>
          <span>
            {mentionText.slice(0, startIndex)}
            <span
              style={{
                backgroundColor: '#f7f7a2',
                borderRadius: 5,
                padding: 2,
              }}
            >
              {name}
            </span>
            {mentionText.slice(endIndex + 1)}
          </span>
        </Col>
      </Row>
    </div>
  );
};
const dragAndDropColStyle = {
  backgroundColor: '#e8e8e8',
  borderRadius: 20,
  padding: 15,
};
const EditClusters = ({ clusterGroups, onEdit }: EditClustersProps) => {
  const [isOpen, setIsOpen] = useState(false); //modal open closed state
  const [sourceCluster, setSourceCluster] = useState<ProcessedCluster | null>(
    null
  ); //selected source cluster
  const [active, setActive] = useState<Item[]>([]); //list containing active items for drag and drop
  const [dest, setDestCluster] = useState<ProcessedCluster | null>(null); //cluster selected to recieve entities
  const [sourceList, setSourceList] = useState<Item[]>([]); //list used to populate the source column
  const [destList, setDestList] = useState<Item[]>([]); //list used to populate the destination column
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set()); //list of selected items
  const [movedEntities, setMovedEntities] = useState<Number[]>([]); //list of moved entities, passed to the api
  const [editedClusters, setEditedClusters] = useState<boolean>(false); //flag to check if clusters have been edited
  const taxonomy = useSelector(selectDocumentTaxonomy); //taxonomy of the document
  const docId = useSelector(selectDocumentId);
  const annSetName = useSelector(selectCurrentAnnotationSetName);
  const context = useContext(DocumentContext);
  const moveEntitiesToClusters = useMutation([
    'document.moveEntitiesToCluster',
  ]);

  useEffect(() => {
    if (sourceCluster && dest) {
      const sourceItems: Item[] = sourceCluster.mentions.map(
        (mention) =>
          ({
            content: mention.mention,
            // @ts-ignore
            fullText: mention.mentionText,
            id: mention.id.toString(),
          } as Item)
      );
      const destItems: Item[] = dest.mentions.map(
        (mention) =>
          ({
            content: mention.mention,
            // @ts-ignore
            fullText: mention.mentionText,
            id: mention.id.toString(),
          } as Item)
      );
      setSourceList(sourceItems);
      setDestList(destItems);
    }
  }, [sourceCluster, dest]);

  function handleCheckboxChange(id: string) {
    setSelectedItems((prev) => {
      const newSelectedItems = new Set(prev);
      if (newSelectedItems.has(id)) {
        newSelectedItems.delete(id);
      } else {
        newSelectedItems.add(id);
      }
      return newSelectedItems;
    });
  }

  function handleSelectAll() {
    if (selectedItems.size === sourceList.length) {
      setSelectedItems(new Set());
    } else {
      const allIds = sourceList.map((item) => item.id);
      setSelectedItems(new Set(allIds));
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    console.log('dragend', active, over);
    if (!over) return;

    const activeList = sourceList.find((item) => item.id === active.id)
      ? 'sourceList'
      : 'destList';
    let overList = '';
    if (activeList == 'sourceList') {
      overList = 'destList';
    } else {
      overList = 'sourceList';
    }

    if (activeList === overList) {
      // Moving within the same list
      if (active.id !== over.id) {
        const list = activeList === 'sourceList' ? sourceList : destList;
        const setList =
          activeList === 'sourceList' ? setSourceList : setDestList;

        // If multiple items are selected, move all selected items
        if (selectedItems.size > 0) {
          const selectedItemsArray = Array.from(selectedItems);
          const movedItems = selectedItemsArray.map((id) =>
            list.find((item) => item.id === id)
          );
          const oldIndex = movedItems.findIndex(
            (item) => item?.id === active.id
          );
          const newIndex = list.findIndex((item) => item.id === over.id);
          setList(arrayMove(list, oldIndex, newIndex));
        } else {
          const oldIndex = list.findIndex((item) => item.id === active.id);
          const newIndex = list.findIndex((item) => item.id === over.id);
          setList(arrayMove(list, oldIndex, newIndex));
        }
      }
    } else {
      // Moving item between lists
      const source = activeList === 'sourceList' ? sourceList : destList;
      const setSource =
        activeList === 'sourceList' ? setSourceList : setDestList;
      const destinationList = overList === 'sourceList' ? sourceList : destList;
      const setDestinationList =
        overList === 'sourceList' ? setSourceList : setDestList;
      // If multiple items are selected, move all selected items
      if (selectedItems.size > 0) {
        const selectedItemsArray = Array.from(selectedItems);
        const moved = source.filter((item) =>
          selectedItemsArray.includes(item.id)
        );

        if (selectedItemsArray) {
          setSource(
            source.filter((item) => !selectedItemsArray.includes(item.id))
          );
          setDestinationList([...destinationList, ...moved]);
          setMovedEntities((prev) => [
            ...prev,
            ...moved.map((item) => Number(item.id.valueOf())),
          ]);
        }
      } else {
        const moved = source.find((item) => item.id === active.id);
        if (moved) {
          // Remove item from the source list
          setSource(source.filter((item) => item.id !== active.id));

          // Add item to the destination list
          setDestinationList([...destinationList, moved]);
          setMovedEntities((prev) => [...prev, Number(active.id.valueOf())]);
        }
      }
    }

    setActive([]);
    setEditedClusters(true);
  }

  function handleDragStart(event: DragStartEvent) {
    const { active } = event;
    const activeList = sourceList.find((item) => item.id === active.id)
      ? 'sourceList'
      : 'destList';

    // If multiple items are selected, set them as active
    if (selectedItems.size > 0) {
      const list = activeList === 'sourceList' ? sourceList : destList;
      const selectedItemsArray = Array.from(selectedItems);
      const activeItems = selectedItemsArray
        .map((id) => list.find((item) => item.id === id))
        .filter((item) => item !== undefined);
      // @ts-ignore
      setActive(activeItems);
    } else {
      const list = activeList === 'sourceList' ? sourceList : destList;
      const item = list.find((item) => item.id === active.id);
      if (item) setActive([item]);
      else setActive([]);
    }
  }

  async function handleSave() {
    let success = false;
    try {
      let updatedDoc = moveEntitiesToClusters.mutate(
        {
          id: docId,
          entities: Array.from(new Set(movedEntities)) as number[],
          sourceCluster: sourceCluster?.id as number,
          annotationSet: annSetName as string,
          destinationCluster: dest?.id as number,
        },
        {
          onSuccess: (data) => {
            if (annSetName) {
              let clusterGroups = getClustersGroups(data, annSetName);

              onEdit(clusterGroups);
              context?.updateData(data);
              message.success('Clusters aggiornati con successo');
              success = true;
            }
          },
        }
      );
      // context?.updateData(updatedDoc);
    } catch (error) {
      console.error(error);
    } finally {
      setSourceCluster(null);
      setDestCluster(null);
      setSourceList([]);
      setDestList([]);
      setSelectedItems(new Set());
      setMovedEntities([]);
      setEditedClusters(false);
      setActive([]);
    }
  }
  return (
    <>
      <Button
        style={{ margin: 15 }}
        onPress={() => {
          console.log('setting is ope');
          setIsOpen(true);
        }}
      >
        Edit clusters
      </Button>
      <Drawer
        width={'70%'}
        title="Modifica cluster"
        open={isOpen}
        onClose={() => setIsOpen(false)}
      >
        <Row justify="space-between" align="middle" gutter={0}>
          <Col span={10}>
            <p>Cluster sorgente</p>
            <Select
              style={{ width: '90%' }}
              placeholder="Seleziona un cluster"
              value={sourceCluster?.id}
              onChange={(value) => {
                let source = null;
                Object.keys(clusterGroups).forEach((groupKey) => {
                  let group = clusterGroups[groupKey];
                  group.forEach((cluster) => {
                    if (cluster.id === value) {
                      source = cluster;
                    }
                  });
                });
                setSourceCluster(source);
              }}
              options={Object.keys(clusterGroups).map((groupKey) => ({
                label: (
                  <span>
                    <Tag
                      color={
                        getAllNodeData(
                          taxonomy,
                          clusterGroups[groupKey][0].type
                        ).color
                      }
                    >
                      <span>{groupKey}</span>
                    </Tag>
                  </span>
                ),
                value: groupKey,
                options: clusterGroups[groupKey].map((cluster) => ({
                  label: cluster.title,
                  value: cluster.id,
                })),
              }))}
            ></Select>
          </Col>
          <Col span={4}>
            <Row justify={'center'}>
              <button
                onClick={() => {
                  if (sourceCluster) {
                    let temp: ProcessedCluster = { ...sourceCluster };
                    setSourceCluster(dest);
                    if (temp) setDestCluster(temp);
                  }
                }}
                style={{
                  marginLeft: -20,
                  backgroundColor: 'white',
                  border: '1px solid gray',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                {'<->'}
              </button>
            </Row>
          </Col>
          <Col span={10}>
            <p>Cluster destinazione</p>
            <Select
              style={{ width: '90%' }}
              placeholder="Seleziona un cluster"
              value={dest?.id}
              onChange={(value) => {
                let dest = null;
                Object.keys(clusterGroups).forEach((groupKey) => {
                  let group = clusterGroups[groupKey];
                  group.forEach((cluster) => {
                    if (cluster.id === value) {
                      dest = cluster;
                    }
                  });
                });
                setDestCluster(dest);
              }}
              options={Object.keys(clusterGroups).map((groupKey) => ({
                label: (
                  <span>
                    <Tag
                      color={
                        getAllNodeData(
                          taxonomy,
                          clusterGroups[groupKey][0].type
                        ).color
                      }
                    >
                      <span>{groupKey}</span>
                    </Tag>
                  </span>
                ),
                value: groupKey,
                options: clusterGroups[groupKey].map((cluster) => ({
                  label: cluster.title,
                  value: cluster.id,
                })),
              }))}
            ></Select>
          </Col>
        </Row>
        <Row style={{ width: '100%' }}>
          {(sourceList.length > 0 || destList.length > 0) && (
            <DndContext
              onDragStart={handleDragStart}
              collisionDetection={closestCorners}
              onDragEnd={handleDragEnd}
            >
              <Row
                justify={'space-between'}
                style={{ width: '100%', padding: 10 }}
                gutter={20}
              >
                <Col span={11} style={dragAndDropColStyle}>
                  <Button
                    size="sm"
                    color={'secondary'}
                    style={{ marginBottom: 10 }}
                    onPress={handleSelectAll}
                  >
                    Select all
                  </Button>
                  <SortableContext
                    items={sourceList}
                    strategy={rectSortingStrategy}
                  >
                    {sourceList.map((item) => {
                      return (
                        <SortableItem
                          key={item.id}
                          id={item.id}
                          name={item.content}
                          mentionText={item.fullText}
                          activeItems={active}
                          selectedItems={selectedItems}
                          onCheckboxChange={handleCheckboxChange}
                        />
                      );
                    })}
                  </SortableContext>
                </Col>
                <Col span={11} style={dragAndDropColStyle}>
                  <SortableContext
                    items={destList}
                    strategy={rectSortingStrategy}
                  >
                    {destList.map((item) => (
                      <SortableItem
                        key={item.id}
                        id={item.id}
                        name={item.content}
                        mentionText={item.fullText}
                        activeItems={active}
                        selectedItems={selectedItems}
                        onCheckboxChange={handleCheckboxChange}
                      />
                    ))}
                  </SortableContext>
                </Col>
              </Row>
              <DragOverlay>
                {active &&
                  active.length > 0 &&
                  active.map((activeItem) => (
                    <SortableItem
                      key={activeItem.id}
                      id={activeItem.id}
                      name={activeItem.content}
                      mentionText={activeItem.fullText}
                      activeItems={active}
                      selectedItems={selectedItems}
                      onCheckboxChange={handleCheckboxChange}
                    />
                  ))}
              </DragOverlay>
            </DndContext>
          )}
        </Row>
        {editedClusters && (
          <Row justify={'center'}>
            <Button onClick={handleSave}>Salva</Button>
          </Row>
        )}
      </Drawer>
    </>
  );
};

export default EditClusters;
