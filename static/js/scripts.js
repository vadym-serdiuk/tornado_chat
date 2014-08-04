var ws = null;
var rooms = new Array();

$(document).ready(function(){
    url = location.hostname+(location.port ? ':'+location.port: '');
    ws = new WebSocket('ws://' + url + '/chat');
    ws.onmessage = onmessage;

    $('#join_room').on('click', function(){
        room = $('rooms')
        $('.messages').html('');
    })

    $('#stop').on('click', function(){
    })

    $('#send').on('click', function(){
        text = $('#newmessage').val();
        if (text == '') return;
        data = {
            text: text
        }
        ws.send(JSON.stringify(data));
        if (ws.bufferedAmount == 0){
            $('#newmessage').val('')
        }else{
            $('#messages').append('<p class="error">Something wrong</p>');
        }
    })
})

function reload_rooms(){
}

function onmessage(event){
    data = JSON.parse(event.data);
    if ('event' in data){
        if (data.event == 'room_created'){
            reload_rooms();
        }
        return;
    }
    if ('text' in data){
        data.time = new Date(data.time.$date);
        html = '<p class="message"><span class="username">' + data.username +
         '</span><span class="time">' + data.time.toTimeString().substring(0,8) +
         '</span><span class="text">' + data.text + '</span>';
        messages = $('.messages.'+data.room)[0];
        $('.messages').addClass('invisible')
        messages.removeClass('invisible');
        messages.append(html);
        messages.scrollTop(messages.scrollHeight);
    }
}
