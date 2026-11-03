import { useState } from 'react';
import { Drawer, Tabs } from '@arco-design/web-react';
import "../../style/global.css"
import SessionTimeGraphTab from './SessionTimeGraphTab.js';
import SessionDataStreamTab from './SessionDataStreamTab.js';
import SessionAgent from './SessionAgent';
import { useLocation } from 'react-router-dom';
const TabPane = Tabs.TabPane;


const SessionDetailPage = () => {
    const [activeTab, setActiveTab] = useState('1');
    const [assistantVisible, setAssistantVisible] = useState(false);
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const windowParams = new URLSearchParams(window.location.search)
    const sessionId = params.get('sessionId') || windowParams.get('sessionId')

    return (
      <>
      <Tabs activeTab={activeTab} onChange={(key) => {
        if (key === '3') {
          setAssistantVisible(true);
        } else {
          setActiveTab(key);
        }
      }}>
        <TabPane key='1' title='会话时序图'>
          <SessionTimeGraphTab sessionId={sessionId}></SessionTimeGraphTab>
        </TabPane>
        <TabPane key='2' title='会话数据流'>
          <SessionDataStreamTab sessionId={sessionId}></SessionDataStreamTab>
        </TabPane>
        <TabPane key='3' title='会话分析助手' />

      </Tabs>
      <Drawer
        className='session-agent-drawer'
        title='会话分析助手'
        placement='right'
        width='min(620px, 100vw)'
        visible={assistantVisible}
        onCancel={() => setAssistantVisible(false)}
        footer={null}
        mountOnEnter
        unmountOnExit={false}
      >
        <div className='session-agent-drawer-panel' role='dialog' aria-label='会话分析助手' aria-modal='true' aria-hidden={!assistantVisible}>
          <SessionAgent key={sessionId} sessionId={sessionId} />
        </div>
      </Drawer>
      </>
  );
};

export default SessionDetailPage;
