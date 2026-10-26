import { Tabs} from '@arco-design/web-react';
import "../../style/global.css"
import SessionTimeGraphTab from './SessionTimeGraphTab.js';
import SessionDataStreamTab from './SessionDataStreamTab.js';
import { useLocation } from 'react-router-dom';
const TabPane = Tabs.TabPane;


const SessionDetailPage = () => {
    const location = useLocation();
    const params = new URLSearchParams(location.search);
    const windowParams = new URLSearchParams(window.location.search)
    const sessionId = params.get('sessionId') || windowParams.get('sessionId')

    return (
      <Tabs defaultActiveTab='1'>
        <TabPane key='1' title='会话时序图'>
          <SessionTimeGraphTab sessionId={sessionId}></SessionTimeGraphTab>
        </TabPane>
        <TabPane key='2' title='会话数据流'>
          <SessionDataStreamTab sessionId={sessionId}></SessionDataStreamTab>
        </TabPane>

      </Tabs>
  );
};

export default SessionDetailPage;
