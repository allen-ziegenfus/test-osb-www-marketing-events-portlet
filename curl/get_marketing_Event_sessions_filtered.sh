curl 'https://www.liferay.com/api/jsonws/invoke'  --data-urlencode 'cmd={"$session[titleCurrentValue,marketingEventSessionId] = /osb.marketingeventsession/get-marketing-event-sessions":{"marketingEventId":202579321,"start":1,"end":50,"$users[firstName,lastName] = /osb.marketingeventsession/get-marketing-event-session-users":{"@marketingEventSessionId":"$session.marketingEventSessionId"}}}'