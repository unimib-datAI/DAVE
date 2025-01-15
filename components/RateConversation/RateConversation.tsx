import { conversationRatedAtom } from '@/utils/atoms';
import { FrownOutlined, MehOutlined, SmileOutlined } from '@ant-design/icons';
import { Col, Flex, message, Rate, Row } from 'antd';
import { useAtom } from 'jotai';
import { AnimatePresence, motion } from 'framer-motion';
import { useMutation } from '@/utils/trpc';

interface RateConversationProps {
  state: Object;
}

export default function RateConversation({ state }: RateConversationProps) {
  const [ratedConversation, setRatedConversation] = useAtom(
    conversationRatedAtom
  );
  const rateConversationMutation = useMutation(['search.rateTheConversation']);

  const customIcons: Record<number, React.ReactNode> = {
    1: <FrownOutlined style={{ fontSize: 24 }} />,
    2: <FrownOutlined style={{ fontSize: 24 }} />,
    3: <MehOutlined style={{ fontSize: 24 }} />,
    4: <SmileOutlined style={{ fontSize: 24 }} />,
    5: <SmileOutlined style={{ fontSize: 24 }} />,
  };
  // Animation variants for appearance
  const slideInVariants = {
    hidden: { x: '-100%', opacity: 0 }, // Start off-screen to the left
    visible: { x: '0%', opacity: 1, transition: { duration: 1 } }, // Slide in and become visible
    exit: { x: '-100%', opacity: 0, transition: { duration: 1 } }, // Slide out to the right
  };

  async function handleRateConversation(value: number) {
    try {
      console.log('Rating the conversation', value);
      let res = await rateConversationMutation.mutateAsync({
        conversation: state,
        rating: value,
      });
      message.success('Conversation rated successfully');
    } catch (error) {
      message.error('Error rating the conversation');
    }
  }
  return (
    <AnimatePresence>
      {ratedConversation ? (
        <motion.div
          key={'thank-you'}
          variants={slideInVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <span
            style={{
              display: 'inline-block',
              padding: 15,
            }}
            className="bg-gray-50 rounded-lg"
          >
            Thank you for your rating
          </span>
        </motion.div>
      ) : (
        <motion.div
          key={'rate-conversation'}
          variants={slideInVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          // className="bg-gray-200 rounded-lg p-4 inline-block"
        >
          <Col>
            <Row align={'middle'}></Row>
            <Row align={'middle'}>
              <div
                style={{
                  paddingLeft: 10,
                  paddingRight: 10,
                  paddingTop: 15,
                  display: 'flex', // Ensure the container respects layout
                  alignItems: 'start',
                  flexDirection: 'column',
                }}
                className="bg-gray-50 rounded-lg"
              >
                <span
                  style={{
                    display: 'inline-block',
                    marginBottom: 10,
                  }}
                >
                  Rate the conversation!
                </span>

                <Rate
                  // style={{
                  //   paddingLeft: 10,
                  //   paddingRight: 10,
                  //   paddingTop: 15,
                  //   display: 'flex', // Ensure the container respects layout
                  //   alignItems: 'center',
                  // }}
                  defaultValue={3}
                  onChange={handleRateConversation}
                  character={({ index = 0 }) => customIcons[index + 1]}
                />
              </div>
            </Row>
          </Col>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
